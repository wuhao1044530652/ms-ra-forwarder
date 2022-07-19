import axios from 'axios'
import { Request, Response } from 'express'
import e = require('express')
import { service, FORMAT_CONTENT_TYPE } from '../service/azure'

module.exports = async (request: Request, response: Response) => {
  try {
    if (request.method === 'GET') {
      let token = await service.getToken()
      let listResponse = await axios.get(
        'https://westus.tts.speech.microsoft.com/cognitiveservices/voices/list',
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      )
      let data = listResponse.data
      response
        .status(200)
        .setHeader('Content-Type', 'application/json; charset=utf-8')
        .end(JSON.stringify(data))
    } else {
      console.debug(`请求正文：${request.body}`)
      let token = process.env.TOKEN
      if (token) {
        let authorization = request.headers['authorization']
        if (authorization != `Bearer ${token}`) {
          console.error('无效的TOKEN')
          response.status(401).json('无效的TOKEN')
          return
        }
      }

      let format =
        request.headers['format'] || 'audio-16khz-32kbitrate-mono-mp3'
      if (Array.isArray(format)) {
        throw `无效的音频格式：${format}`
      }
      if (!FORMAT_CONTENT_TYPE.has(format)) {
        throw `无效的音频格式：${format}`
      }

      let ssml = request.body
      if (ssml == null) {
        throw `转换参数无效`
      }
      let result = await service.convert(ssml, format)
      response.sendDate = true
      response
        .status(200)
        .setHeader('Content-Type', FORMAT_CONTENT_TYPE.get(format))
      response.end(result)
    }
  } catch (error) {
    console.error('发生错误', error)
    response.status(503).json(error)
  }
}
