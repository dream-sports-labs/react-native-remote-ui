/* eslint-disable no-new-func */
import * as React from 'react';
import type { RSCPromise, RSCConfig, RSCSource, RSCProps } from '../@types';
import RSC from './ServerComponent';
import axios, { type AxiosRequestConfig } from 'axios';
import ComponentCache from '../cache/componentCache';
import { RSCResponseHeaders } from '../utils/constants';
import { getTTLFromResponseHeaders } from '../utils/utils';

const cache = ComponentCache.getInstance<React.Component>();

const defaultGlobal = Object.freeze({
  require: (moduleId: string) => {
    if (moduleId === 'react') {
      return require('react');
    } else if (moduleId === 'react-native') {
      return require('react-native');
    } else if (moduleId === '@babel/runtime/helpers/typeof') {
      return require('@babel/runtime/helpers/typeof');
    } else if (moduleId === '@babel/runtime/helpers/interopRequireDefault') {
      return require('@babel/runtime/helpers/interopRequireDefault');
    } else if (moduleId === '@babel/runtime/helpers/slicedToArray') {
      return require('@babel/runtime/helpers/slicedToArray');
    }
    return null;
  },
});

const createComponent =
  (global: any) =>
  async (src: string): Promise<React.Component> => {
    const globalName = '__SERVER_COMPONENT__';
    const Component = await new Function(
      globalName,
      `${Object.keys(global)
        .map((key) => `var ${key} = ${globalName}.${key};`)
        .join('\n')}; const exports = {}; ${src}; return exports.default`
    )(global);
    return Component;
  };

const axiosRequest = (config: AxiosRequestConfig) => axios(config);

const buildRSC =
  ({
    openURI,
  }: {
    readonly openURI: (
      uri: string,
      callback: RSCPromise<React.Component>
    ) => void;
  }) =>
  async (source: RSCSource): Promise<React.Component> => {
    // TODO handle string source
    if (source && typeof source === 'object') {
      const { uri } = source;
      // TODO handle uri validation
      if (typeof uri === 'string') {
        return new Promise<React.Component>((resolve, reject) =>
          openURI(uri, { resolve, reject })
        );
      }
    }
    throw new Error(`[ServerComponent]: Source is invalid`);
  };

const buildRequest =
  ({
    component,
  }: {
    readonly component: (src: string) => Promise<React.Component>;
  }) =>
  async (uri: string, callback: RSCPromise<React.Component>) => {
    try {
      const result = await axiosRequest({ url: uri, method: 'get' });
      const { data, headers } = result;
      var ttl = getTTLFromResponseHeaders(headers);
      if (
        headers[RSCResponseHeaders.ttl] &&
        headers[RSCResponseHeaders.ttl] !== ''
      ) {
        ttl = headers[RSCResponseHeaders.ttl];
      }

      if (typeof data !== 'string') {
        throw new Error(
          `[ServerComponent]: Expected string data, encountered ${typeof data}`
        );
      }
      const Component = await component(data);
      cache.set(uri, {
        value: Component,
        ttl: ttl,
        timestamp: Date.now(),
      });
      return callback.resolve(Component);
    } catch (e) {
      cache.set(uri, null);
      console.log(`[ServerComponent]: Build Request caught error ${e}`);
      return callback.reject(new Error(`${e.message}`));
    }
  };

const buildURIForRSC =
  ({
    uriRequest,
  }: {
    readonly uriRequest: (
      uri: string,
      callback: RSCPromise<React.Component>
    ) => void;
  }) =>
  (uri: string, callback: RSCPromise<React.Component>): void => {
    const cachedTimeStamp: number = cache.getTimeStamp(uri);
    const ttl: number = cache.getTTL(uri);
    const { resolve, reject } = callback;

    // No value found for ttl, serve component from cache if exists
    if (ttl === -1) {
      const Component = cache.get(uri);
      if (Component === null) {
        return uriRequest(uri, callback);
      } else if (typeof Component === 'function') {
        return resolve(Component);
      }
    }

    // ignore cache in case of ttl is 0
    // for any other value, check if cache needs to burst
    if (ttl === 0 || Date.now() - cachedTimeStamp > ttl) {
      cache.delete(uri);
      return uriRequest(uri, callback);
    }

    return reject(
      new Error(`[RSC]: Component for uri "${uri}" could not be instantiated`)
    );
  };

function buildServerComponent({ global }: RSCConfig) {
  const component = createComponent(global);
  const uriRequest = buildRequest({ component });
  const openURI = buildURIForRSC({ uriRequest });
  return buildRSC({ openURI });
}

function createServerComponent({ global }: RSCConfig) {
  const Component = (props: RSCProps) => (
    <RSC {...props} openRSC={buildServerComponent({ global })} />
  );
  return Object.freeze({
    Component,
  });
}

export function preloadServerComponent({ global = defaultGlobal }: RSCConfig) {
  const rsc = buildServerComponent({ global });
  const preload = async (uri: string): Promise<void> => {
    await rsc({ uri });
  };
  return Object.freeze({
    preload,
  });
}

export const ServerComponent = ({
  global = defaultGlobal,
  source,
  ...extras
}: RSCProps): JSX.Element | null => {
  const { Component } = React.useMemo(() => {
    return createServerComponent({ global });
  }, [global]);

  if (source && Component) {
    return <Component source={source} {...extras} />;
  }
  return null;
};