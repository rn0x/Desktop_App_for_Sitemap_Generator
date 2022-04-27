const { ipcRenderer } = require('electron');
const sitemap = require('./sitemap.js');


window.addEventListener('DOMContentLoaded', async (e) => {
    

    e.preventDefault();

    let Path_appDate = await ipcRenderer.invoke('Path_appDate');

    document.getElementById('min-button').addEventListener("click", event => {
        ipcRenderer.send('minimize') 
    });

    document.getElementById('close-button').addEventListener("click", event => {
        ipcRenderer.send('close') 
    });

    document.getElementById('title_app').innerText = 'SiteMap Generator'
    document.getElementById('title_app_p').innerText = 'For small and large sites'
    document.getElementById('but_sitemap').innerText = 'Start'
    document.getElementById('error').innerText = 'Make sure you type the website link correctly !'
    document.getElementById('error').dir = 'ltr'
    document.getElementById('Developed').innerText = 'Github @rn0x'
    document.getElementById('download_TEXT').innerText = 'Download Sitemap.xml'
    document.getElementById('sitemap_download_a').innerText = 'Download'
    document.getElementById('back').innerText = 'back'

    document.getElementById('but_sitemap').addEventListener("click", async e => {

        e.preventDefault();

        let input_sitemap_value = document.getElementById('input_sitemap').value

        if (input_sitemap_value === '' || input_sitemap_value.includes('http') === false) {
        
            document.getElementById('error').style = 'display: block;'

            setTimeout(() => {

                document.getElementById('error').style = 'display: none;'

            }, 3000);
        }

        else {

            await sitemap(Path_appDate, input_sitemap_value);

        }


    });


    document.getElementById('error').style = 'display: none;'
    document.getElementById('sitemap_load').style = 'display: none;'
    document.getElementById('sitemap_download').style = 'display: none;'


});