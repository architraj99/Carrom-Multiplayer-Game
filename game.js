const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")
const { Engine, Bodies, Body, Composite } = Matter
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

const engine = Engine.create({ enableSleeping: true })
const coinBodies = []
let strikerBody
let previousTime = performance.now()

let currentPlayer = 0
let phase = "placing"
let isDragging = false
let dragPoint = null
let shotStartedAt = 0

engine.gravity.scale = 0

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

const movingOptions = {
  restitution: 0.64,
  friction: 0.055,
  frictionStatic: 0.08,
  frictionAir: 0.032,
  density: 0.0028,
  sleepThreshold: 45
}

formation.forEach((coin) => {

  const body = Bodies.circle(coin.x, coin.y, coinSize * 0.43, {
    ...movingOptions,
    label: `coin:${coin.type}`
  })
  body.coinType = coin.type
  coinBodies.push(body)
})

strikerBody = Bodies.circle(center, boardSize - 137, strikerSize * 0.43, { ...movingOptions,
  density: 0.0044, restitution: 0.6, label: "striker"
})

const wallOptions = {
  isStatic: true,
  restitution: 0.54,
  friction: 0.09,
  label: "board-wall"
}
const walls = [ Bodies.rectangle(center, 31, boardSize - 112, 26, wallOptions),

  Bodies.rectangle(center, boardSize - 31, boardSize - 112, 26, wallOptions),

  Bodies.rectangle(31, center, 26, boardSize - 112, wallOptions),

  Bodies.rectangle(boardSize - 31, center, 26, boardSize - 112, wallOptions)
]

const pocketSensors = [
  [playMin, playMin],
  [playMax, playMin],
  [playMin, playMax],
  [playMax, playMax]
].map(([x, y], index) => Bodies.circle(x, y, 25, {
  isStatic: true,
  isSensor: true,
  label: `pocket:${index}`
}))

Composite.add(engine.world, [...coinBodies, strikerBody, ...walls, ...pocketSensors])
Body.setStatic(strikerBody, true)

const baselineY = () => currentPlayer === 0 ? boardSize - 137 : 137
const baselineMinX = 196
const baselineMaxX = boardSize - 196

const pointerPosition = (event) => {

  const bounds = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height
  }
}

const placeStriker = (x) => {

  const nextX = Math.max(baselineMinX, Math.min(baselineMaxX, x))
  Body.setPosition(strikerBody, { x: nextX, y: baselineY() })
  Body.setVelocity(strikerBody, { x: 0, y: 0 })

}

canvas.addEventListener("pointerdown", (event) => {

  if (phase !== "placing") return
  const point = pointerPosition(event)
  const distanceFromStriker = Math.hypot(point.x - strikerBody.position.x, point.y - strikerBody.position.y)
  const onBaseline = Math.abs(point.y - baselineY()) <= 34 && point.x >= baselineMinX - 20 && point.x <= baselineMaxX + 20

  if (!onBaseline && distanceFromStriker > strikerSize) return

  if (onBaseline && distanceFromStriker > strikerSize) placeStriker(point.x)

  isDragging = true
  dragPoint = point
  canvas.setPointerCapture(event.pointerId)
})

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging || phase !== "placing") return
  dragPoint = pointerPosition(event)
})

const releaseShot = (event) => {

  if (!isDragging || phase !== "placing") return
  isDragging = false

  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)

  const releasePoint = pointerPosition(event)
  dragPoint = releasePoint
  const pullX = strikerBody.position.x - releasePoint.x
  const pullY = strikerBody.position.y - releasePoint.y
  const pullLength = Math.min(Math.hypot(pullX, pullY), 150)

  if (pullLength < 9) {
    dragPoint = null
    return
  }
  const scale = pullLength / Math.hypot(pullX, pullY)
  const velocityScale = 0.145
  Body.setStatic(strikerBody, false)

  Body.setVelocity(strikerBody, {
    x: pullX * scale * velocityScale,
    y: pullY * scale * velocityScale
  })
  phase = "moving"
  dragPoint = null
  shotStartedAt = performance.now()
}

canvas.addEventListener("pointerup", releaseShot)
canvas.addEventListener("pointercancel", () => {
  isDragging = false
  dragPoint = null
})

const allPiecesSettled = () => {
  const pieces = [...coinBodies, strikerBody]
  return pieces.every((body) => body.isSleeping || body.speed < 0.11)
}

const prepareStriker = () => {
  Body.setStatic(strikerBody, true)
  placeStriker(center)
  phase = "placing"
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

const drawAimGuide = () => {

  if (!isDragging || !dragPoint) return

  const pullX = strikerBody.position.x - dragPoint.x
  const pullY = strikerBody.position.y - dragPoint.y
  const rawLength = Math.hypot(pullX, pullY)
  const pullLength = Math.min(rawLength, 150)

  if (!rawLength) return

  const directionX = pullX / rawLength
  const directionY = pullY / rawLength
  const guideLength = 58 + pullLength * 1.35

  ctx.save()
  ctx.setLineDash([11, 8])
  ctx.strokeStyle = "#7a2e2e"
  ctx.lineWidth = 4
  ctx.beginPath()

  ctx.moveTo(strikerBody.position.x + directionX * 25, strikerBody.position.y + directionY * 25)
  ctx.lineTo(strikerBody.position.x + directionX * guideLength, strikerBody.position.y + directionY * guideLength)

  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = "#6b3f1d"
  ctx.beginPath()

  ctx.moveTo(strikerBody.position.x + directionX * (guideLength + 12), strikerBody.position.y + directionY * (guideLength + 12))
  ctx.lineTo(strikerBody.position.x + directionX * guideLength - directionY * 9, strikerBody.position.y + directionY * guideLength + directionX * 9)
  ctx.lineTo(strikerBody.position.x + directionX * guideLength + directionY * 9, strikerBody.position.y + directionY * guideLength - directionX * 9)
  ctx.closePath()
  ctx.fill()

  const meterX = center - 110
  const meterY = currentPlayer === 0 ? boardSize - 94 : 78

  ctx.fillStyle = "#f0e2c0"
  ctx.fillRect(meterX, meterY, 220, 16)
  ctx.strokeStyle = "#6b3f1d"
  ctx.lineWidth = 3
  ctx.strokeRect(meterX, meterY, 220, 16)
  ctx.fillStyle = pullLength > 118 ? "#7a2e2e" : "#2f4a2f"
  ctx.fillRect(meterX + 4, meterY + 4, 212 * pullLength / 150, 8)
  ctx.restore()
}

const render = (time = performance.now()) => {

  const delta = Math.min(time - previousTime, 33.333)
  previousTime = time
  Engine.update(engine, delta)

  drawBoard()
  coinBodies.forEach((body) => drawSprite(body.coinType, body.position.x, body.position.y, coinSize))
  drawSprite("striker", strikerBody.position.x, strikerBody.position.y, strikerSize)
  drawAimGuide()

  if (phase === "moving" && time - shotStartedAt > 650 && allPiecesSettled()) prepareStriker()

  requestAnimationFrame(render)
}

render()