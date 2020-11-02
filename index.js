const http = require('http')
const https = require('https')
const port = process.env.PORT || 9191
const net = require('net')
const url = require('url')
var defPorts = {
  http: 80,
  https: 443/*,
  // waiting for support
  ws: 80,
  wss: 443*/
}
const requestHandler = (req, res) => { // discard all request to proxy server except HTTP/1.1 CONNECT method
  const {port, hostname, protocol, pathname, search, hash} = url.parse(`${req.url}`, false, true)
  if(hostname&&protocol){
    var options = {
      host: hostname,
      port: port ? port : defPorts[protocol],
      path: pathname + search + hash,
      headers: req.headers,
      method: req.method
    }
    console.log(options)
    console.log(protocol)
    if(protocol == "https:"){
      var request = http.request(options, (response) => {
        res.writeHead(response.statusCode, response.headers)
        response.pipe(res)
      })
      req.pipe(request)
    } else {
      var request = https.request(options, (response) => {
        res.writeHead(response.statusCode, response.headers)
        response.pipe(res)
      })
      req.pipe(request)
    }
  } else {
      res.writeHead(400, {'Content-Type': 'text/plain'})
      res.end('Bad request')
  }
}

const server = http.createServer(requestHandler)

const listener = server.listen(port, (err) => {
  if (err) {
    return console.error(err)
  }
  const info = listener.address()
  console.log(`Server is listening on address ${info.address} port ${info.port}`)
})

server.on('connect', (req, clientSocket, head) => { // listen only for HTTP/1.1 CONNECT method
  console.log(clientSocket.remoteAddress, clientSocket.remotePort, req.method, req.url)
  
  const {port, hostname} = url.parse(`//${req.url}`, false, true) // extract destination host and port from CONNECT request
  if (hostname && port) {
    const serverErrorHandler = (err) => {
      console.error(err.message)
      if (clientSocket) {
        clientSocket.end(`HTTP/1.1 500 ${err.message}\r\n`)
      }
    }
    const serverEndHandler = () => {
      if (clientSocket) {
        clientSocket.end(`HTTP/1.1 500 External Server End\r\n`)
      }
    }
    const serverSocket = net.connect(port, hostname) // connect to destination host and port
    const clientErrorHandler = (err) => {
      console.error(err.message)
      if (serverSocket) {
        serverSocket.end()
      }
    }
    const clientEndHandler = () => {
      if (serverSocket) {
        serverSocket.end()
      }
    }
    clientSocket.on('error', clientErrorHandler)
    clientSocket.on('end', clientEndHandler)
    serverSocket.on('error', serverErrorHandler)
    serverSocket.on('end', serverEndHandler)
    serverSocket.on('connect', () => {
      clientSocket.write([
        'HTTP/1.1 200 Connection Established',
        'Proxy-agent: Node-VPN',
      ].join('\r\n'))
      clientSocket.write('\r\n\r\n') // empty body
      // "blindly" (for performance) pipe client socket and destination socket between each other
      serverSocket.pipe(clientSocket, {end: false})
      clientSocket.pipe(serverSocket, {end: false})
    })
  } else {
    clientSocket.end('HTTP/1.1 400 Bad Request\r\n')
    clientSocket.destroy()
  }
})
