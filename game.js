const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")
const boardSize = canvas.width
const playMin = 57
const playMax = boardSize - 57
const center = boardSize / 2
const coinSize = 31
const strikerSize = 43
const images = {}

const imageSources = {
  board: "assets/wood-board.png",
  white: "assets/coin-white.png",
  black: "assets/coin-black.png",
  queen: "assets/coin-queen.png",
  striker: "assets/striker.png"
}

const formation = []

Object.entries(imageSources).forEach(([name, src]) => {
  const image = new Image()
  image.src = src
  images[name] = image
})

const addCoin = (type, x, y) => formation.push({ type, x, y })
const ringRadius = 32
const outerRadius = 62

addCoin("queen", center, center)

for (let index = 0; index < 6; index += 1) {
  const angle = -Math.PI / 2 + index * Math.PI / 3
  addCoin(index % 2 === 0 ? "white" : "black", center + Math.cos(angle) * ringRadius, center + Math.sin(angle) * ringRadius)
}

for (let index = 0; index < 12; index += 1) {
  const angle = -Math.PI / 2 + index * Math.PI / 6
  addCoin(index % 2 === 0 ? "black" : "white", center + Math.cos(angle) * outerRadius, center + Math.sin(angle) * outerRadius)
}

const drawBoard = () => {

  ctx.clearRect(0, 0, boardSize, boardSize)
  ctx.fillStyle = "#e8d5a8"
  ctx.fillRect(0, 0, boardSize, boardSize)

  if (images.board.complete) {

    ctx.save()
    ctx.globalAlpha = 0.22
    
    const pattern = ctx.createPattern(images.board, "repeat")
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, boardSize, boardSize)
    ctx.restore()
  }

  ctx.strokeStyle = "#6b3f1d"
  ctx.lineWidth = 5
  ctx.strokeRect(42, 42, boardSize - 84, boardSize - 84)

  ctx.strokeStyle = "#7a2e2e"
  ctx.lineWidth = 3
  ctx.strokeRect(51, 51, boardSize - 102, boardSize - 102)

  drawPockets()
  drawCenterMark()
  drawBaseline(137, true)
  drawBaseline(boardSize - 137, false)
  drawCornerArrows()
}

const drawPockets = () => {
  const pocketPoints = [
    [playMin, playMin],
    [playMax, playMin],
    [playMin, playMax],
    [playMax, playMax]
  ]
  pocketPoints.forEach(([x, y]) => {

    ctx.beginPath()
    ctx.arc(x, y, 31, 0, Math.PI * 2)
    ctx.fillStyle = "#201a14"

    ctx.fill()
    ctx.lineWidth = 6
    ctx.strokeStyle = "#7a2e2e"

    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, 21, 0, Math.PI * 2)

    ctx.strokeStyle = "#3d2b1f"
    ctx.lineWidth = 3
    ctx.stroke()
  })
}

const drawCenterMark = () => {

  ctx.beginPath()
  ctx.arc(center, center, 78, 0, Math.PI * 2)
  ctx.strokeStyle = "#7a2e2e"

  ctx.lineWidth = 4
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(center, center, 67, 0, Math.PI * 2)

  ctx.strokeStyle = "#6b3f1d"
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.beginPath()

  ctx.arc(center, center, 18, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(122, 46, 46, 0.24)"
  ctx.fill()
  ctx.strokeStyle = "#7a2e2e"
  ctx.lineWidth = 2
  ctx.stroke()
}

const drawBaseline = (y, topSide) => {

  const left = 196
  const right = boardSize - 196
  const spacing = 29
  ctx.strokeStyle = "#6b3f1d"
  ctx.lineWidth = 3

  ctx.beginPath()
  ctx.moveTo(left, y - spacing / 2)
  ctx.lineTo(right, y - spacing / 2)
  ctx.moveTo(left, y + spacing / 2)
  ctx.lineTo(right, y + spacing / 2)
  ctx.stroke();

  [left, right].forEach((x) => {

    ctx.beginPath()
    ctx.arc(x, y, spacing / 2, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(122, 46, 46, 0.14)"
    ctx.fill()
    ctx.strokeStyle = "#7a2e2e"
    ctx.lineWidth = 3
    ctx.stroke()
  })

  ctx.fillStyle = "#7a2e2e"
  ctx.font = "9px 'Press Start 2P'"
  ctx.textAlign = "center"
  ctx.fillText(topSide ? "PLAYER 2" : "PLAYER 1", center, topSide ? y - 31 : y + 39)
}

const drawCornerArrows = () => {

  const corners = [
    [119, 119, Math.PI / 4],
    [boardSize - 119, 119, Math.PI * 3 / 4],
    [119, boardSize - 119, -Math.PI / 4],
    [boardSize - 119, boardSize - 119, -Math.PI * 3 / 4]
  ]
  corners.forEach(([x, y, rotation]) => {

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rotation)

    ctx.strokeStyle = "#7a2e2e"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(-16, 0)
    ctx.lineTo(18, 0)
    ctx.lineTo(8, -9)
    ctx.moveTo(18, 0)
    ctx.lineTo(8, 9)
    ctx.stroke()
    ctx.restore()
  })
}

const drawSprite = (name, x, y, size) => {

  const image = images[name]

  if (image.complete && image.naturalWidth) {
    ctx.drawImage(image, x - size / 2, y - size / 2, size, size)
  }

}

const render = () => {

  drawBoard()
  formation.forEach((coin) => drawSprite(coin.type, coin.x, coin.y, coinSize))
  drawSprite("striker", center, boardSize - 137, strikerSize)
  
  requestAnimationFrame(render)
}

render()