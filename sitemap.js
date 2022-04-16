const SitemapGenerator = require('advanced-sitemap-generator');
const path = require('path');

module.exports = async function sitemap(Path_appDate, url) {

    try {

        let urls = 1

        document.getElementById('sitemap').style = 'display: none;'
        document.getElementById('sitemap_download').style = 'display: none;'
        document.getElementById('sitemap_load').style = 'display: block;'


        let generator = SitemapGenerator(url, {
            ignoreHreflang: true,
            maxDepth: 0,
            filepath: path.join(Path_appDate, '/sitemap_generator/sitemap.xml'),
            maxEntriesPerFile: 50000,
            stripQuerystring: true,
            lastMod: true,
            changeFreq: 'always',
        });

        await generator.on('add', async (e) => {
            // sitemaps created

            document.getElementById('sitemap_title_top').innerHTML = e.protocol + '://' + e.host + e.path;
            document.getElementById('urls_span').innerHTML = urls++

            // console.log('add: ' + e.host + e.path);

        });

        await generator.on('done', async (e) => {
            // sitemaps created

            document.getElementById('sitemap_load').style = 'display: none;'
            document.getElementById('sitemap_download').style = 'display: block;'
            document.getElementById('urls_span2').innerHTML = e.added;
            document.getElementById('sitemap_download_a').href = path.join(Path_appDate, '/sitemap_generator/sitemap.xml');
            document.getElementById('sitemap_download_a').download = 'sitemap.xml'

            document.getElementById('back').addEventListener('click', e => {

                e.preventDefault();

                document.getElementById('sitemap').style = 'display: block;'
                document.getElementById('sitemap_load').style = 'display: none;'
                document.getElementById('sitemap_download').style = 'display: none;'

            })


            //console.log(e.urls.length);

        });

        // await generator.on('error', (error) => {

        //     alert('Make sure you type the website link correctly ! \n' + error)
        //     document.getElementById('sitemap').style = 'display: block;'
        //     document.getElementById('sitemap_load').style = 'display: none;'
        //     document.getElementById('sitemap_download').style = 'display: none;'

        // });

        generator.start();

    } catch (error) {

        alert(error)

    }

}