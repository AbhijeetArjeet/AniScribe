const { app } = require('electron');

console.log('Electron version:', process.versions.electron);
console.log('Node version in Electron:', process.versions.node);

app.whenReady().then(() => {
  console.log('Electron app.whenReady fired successfully!');
  process.exit(0);
});
