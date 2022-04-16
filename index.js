const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs-extra');

let Path_Local = fs.existsSync(path.join(process.resourcesPath, '/index.js')) === true ? process.resourcesPath : __dirname
let Path_appDate = app.getPath("appData");
let mainWindow
let tray
let trayMenu

const createWindow = () => {

    mainWindow = new BrowserWindow({
        width: 600,
        height: 400,
        show: false,
        center: true,
        resizable: false,
        frame: false,
        title: 'SiteMap Generator',
        icon: path.join(Path_Local, '/build/icons/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile('./index.html');
    mainWindow.removeMenu()

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('minimize', (event) => {
        event.preventDefault();
        mainWindow.hide();
    });

    mainWindow.on("show", (event) => {
        event.preventDefault();
    });

    mainWindow.on('closed', (event) => {
        event.preventDefault();
        tray = null
        trayMenu = null
        mainWindow = null
    });


    trayMenu = Menu.buildFromTemplate([
        {
            label: 'show app', click: function () {
                mainWindow.show();
            }
        },
        {
            label: 'close app', click: function () {
                mainWindow.destroy();
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);
    tray = new Tray(path.join(Path_Local, '/build/icons/icon.png'));
    tray.setContextMenu(trayMenu);
    tray.setToolTip("SiteMap Generator");
    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    });


}

app.whenReady().then(async () => {

    createWindow();

});

app.on('ready', (e) => {

    e.preventDefault();
    app.setAppUserModelId("org.SiteMap_Generator.rn0x");

    ipcMain.on('minimize', () => {

        mainWindow.minimize()
    });

    ipcMain.on('close', () => {
        mainWindow.close()
    });

    ipcMain.handle('Path_appDate', async () => {
        return Path_appDate // Path Files
    });


});

app.on('before-quit', function () {
    tray.destroy();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});