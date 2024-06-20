const express = require('express');
const fs = require('fs');
const chalk = require('chalk');
const path = require('path');
const app = express();
const mocks = path.resolve(`./server/Mocks`, 'TranspiledExample.js');
const PORT = 8080;

app.get('/', (req, res) => {
  console.log(chalk.green.bold`Serving React Native Remote Component`);
  serverTranspiledJS(req, res);
});

app.listen(PORT, () => {
  console.clear();
  console.log(`Server running at: http://localhost:${PORT}/`);
  console.log(
    `If you are using android emulator use IP 10.0.2.2:8080 in your app`
  );
  console.log(chalk.white.bold` Remote Components are being served!`);
  console.log(chalk.green.bold`Port: ${PORT}`);
});

const serverTranspiledJS = async (req, res) => {
  try {
    const data = fs.readFileSync(mocks, { encoding: 'utf8', flag: 'r' });
    return res.send(data);
  } catch (e) {
    console.log(chalk.red.bold`Got error ${e}`);
    return;
  }
};
