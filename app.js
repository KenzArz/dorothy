import * as readline from 'readline';

import fetch from 'node-fetch'
import ffmpeg from 'fluent-ffmpeg'


import { core, subtitle } from './index.js';
import { scrap } from './scrap.js';
import { parseJsonToAss } from './subass.js'
import { createWriteStream, writeFileSync } from 'fs';
console.log(process.env.BILI_COOKIE)


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function input(param) {
    return new Promise(res => {
        rl.question(param, command => {
            res(command)
        })
    })
};

async function glink() {
    const greq = await input('input the link: ')
    const reg = /https:\/\/(bili.im\/\w{7}$)/

    const errorms = ['the link you input is invalid!!!...try again', 'link is incorrect!!!', 'the link is not from bilibli/bstation', 'you must check again the link you`are inputting']
    const random_erm = random_error(errorms)
    if(!reg.test(greq)) {
        console.log(`${random_erm}\n`)
        return glink()
    }
    return greq
}

async function geps(gid, ep_id) { 
    const gint = parseInt(gid);

    if(isNaN(gint) || !(/\d+$/).test(gid)) {
        const errorm = await input(`please select a number between 1-${ep_id.length}: `)
        return await geps(errorm, ep_id)
    }
    else if(gint > ep_id.length) {
        const errorms = ['the episode that you choosed is not available or you wrong choose episode', `the anime is only have ${ep_id.length} episode`, 'the episode is not available', 'you choose the wrong episode']
        const random_erm = random_error(errorms)
        
        const errorm = await input(`${random_erm}\ntry again: `)
        return await geps(errorm, ep_id)
    }
    return gint
    
};

async function gquality(video) {

    let qstring = ''
    for(const [i, dvideo] of video.entries()) {
        if(dvideo.url.length <= 1)continue

        if((i + 1) % 2 == 0) {qstring += `[${dvideo.bitrate}]\n`; continue}
        qstring += `[${dvideo.bitrate}] `
    }
    const quality = await input(`quality video:\n${qstring} \ninput the quality video: `)
    return quality
}

async function permission(quality) {
    const prefix = ['y', 'n']
    const answer = await input(`the video size is around ${Math.floor(quality / 1024)/ 1000}Mb\n[y/n]: `)
    if(prefix[0] == answer) return true
    else if(prefix[1] == answer) return false
    return await permission(quality)
}

(async() => {
    const rlink = await glink()
    const { title, vid, ep_id} = await scrap(rlink)
    
    const gid = await input(`\nAnime: ${title}
there have ${ep_id.length} Episode, choose one: `)
    const reps = await geps(gid, ep_id)
    const episode = ep_id[reps-1]

    const response = await core(vid, episode)
    
    const quality = await gquality(response.video)
    const video = response.video.find(m => m.bitrate.includes(quality))
    const audio = response.audio.find(m => m.quality == video.audio)
    const gpermission = await permission(video.size)
    if(!gpermission) return rl.close()

    const path = `${title.split(' ').join('_')}_EP-${reps}`
    
    await gbufferr(video.url, path.concat('.mkv'))
    await gbufferr(audio.url, path.concat('.mp3'))

    console.log('download video is done...')
    console.log('prepare to merge video and audio. it will be take a long time...')

    const sub = await subtitle(vid, episode)
    if(!sub.ass) {
        const JSON = await (await fetch(sub.json)).json()
        parseJsonToAss(JSON.body, path.concat('.ass'))
    }
    else {
        const ass = await (await fetch(sub.ass)).text()
        writeFileSync(path.concat('.ass'), ass)
    }

    try {
        await merge(path.concat('.mkv'), path.concat('.mp3'), path)
        console.log('download successfully...')
    } catch (e) {
        console.log('ERROR:\n' + e)
    }  
    
    rl.close()

})()


const random_error = errArr => errArr[Math.floor(Math.random() * (errArr.length - 1))]
const gbufferr = async(url, path) => {
    const response = await fetch(url)
    return new Promise(res => {
        response.body.pipe(createWriteStream(path))
            .on('finish', () => {
                res('download successfully...')
            })
    })
}
const merge = (vpath, apath, path) => {
    return new Promise((res, rej) => {
        ffmpeg()
            .input(vpath).fps(24).videoCodec('libx264').videoFilters('scale=1280:720')
            .input(apath).audioCodec('libmp3lame')
            .outputOptions('-vf subtitles=./' + path.concat('.ass'))
            .on('error', e => rej('error\n' + e))
            .save(path.concat('.mkv'))
            .on('end', () => res('merging successfully...'))
        })
}