const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")

const playerPanels = [document.getElementById("player1Panel"), document.getElementById("player2Panel")]

const scoreElements = [document.getElementById("player1Score"), document.getElementById("player2Score")]
const rackElements = [document.getElementById("player1Rack"), document.getElementById("player2Rack")]
const turnNameElement = document.getElementById("turnName")
const rulingElement = document.getElementById("rulingText")
const gameOverElement = document.getElementById("gameOver")
const winnerElement = document.getElementById("winnerText")
const finalScoreElement = document.getElementById("finalScore")

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter
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

let shotRecord = null
let strikerInWorld = true
let queenBody = null
let lastCollisionSoundAt = 0

const players = [
  { name: "Player 1", piece: "white", score: 0, pocketedBodies: [] },
  { name: "Player 2", piece: "black", score: 0, pocketedBodies: [] }
]
const queenState = {
  pendingPlayer: null,
  owner: null
}
let lastRuling = "Player 1 breaks"

const sounds = {
  shot: new Audio("assets/shot.ogg"),
  collision: new Audio("assets/collision.ogg"),
  pocket: new Audio("assets/pocket.ogg"),
  foul: new Audio("assets/foul.ogg")
}

Object.values(sounds).forEach((sound) => sound.preload = "auto")

const playSound = (name, volume = 0.5) => {
  const source = sounds[name]
  if (!source) return
  const sound = source.cloneNode()
  sound.volume = volume
  const playback = sound.play()
  if (playback) playback.catch(() => {})
}

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
  if (coin.type === "queen") queenBody = body
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

Events.on(engine, "collisionStart", (event) => {

  if (!shotRecord) return

  event.pairs.forEach((pair) => {

    const labels = [pair.bodyA.label, pair.bodyB.label]
    const strikerHitCoin = labels.includes("striker") && labels.some((label) => label.startsWith("coin:"))
    if (strikerHitCoin) shotRecord.touchedCoin = true

    const pieceCollision = labels.every((label) => label === "striker" || label.startsWith("coin:"))
    const now = performance.now()

    if (pieceCollision && phase === "moving" && now - lastCollisionSoundAt > 65) {
      const relativeSpeed = Math.hypot(pair.bodyA.velocity.x - pair.bodyB.velocity.x, pair.bodyA.velocity.y - pair.bodyB.velocity.y)
      
      if (relativeSpeed > 0.45) {
        playSound("collision", Math.min(0.65, 0.16 + relativeSpeed / 32))
        lastCollisionSoundAt = now
      }
    }
  })
})

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

  Sleeping.set(strikerBody, false)
  Body.setVelocity(strikerBody, {
    x: pullX * scale * velocityScale,
    y: pullY * scale * velocityScale
  })
  playSound("shot", Math.min(0.75, 0.28 + pullLength / 300))
  phase = "moving"
  shotRecord = {
    touchedCoin: false,
    pocketed: [],
    strikerPocketed: false,
    wrongFirst: false
  }
  dragPoint = null
  shotStartedAt = performance.now()
}

canvas.addEventListener("pointerup", releaseShot)
canvas.addEventListener("pointercancel", () => {
  isDragging = false
  dragPoint = null
})

const allPiecesSettled = () => {
  const pieces = strikerInWorld ? [...coinBodies, strikerBody] : [...coinBodies]
  return pieces.every((body) => body.isSleeping || body.speed < 0.11)
}

const prepareStriker = () => {

  if (!strikerInWorld) {
    Composite.add(engine.world, strikerBody)
    strikerInWorld = true
  }

  Body.setStatic(strikerBody, true)
  strikerBody.collisionFilter.mask = 4294967295
  placeStriker(center)
  phase = "placing"
  shotRecord = null
  updateHud()
}

const removeCoin = (body) => {
  const index = coinBodies.indexOf(body)
  if (index >= 0) coinBodies.splice(index, 1)
  Composite.remove(engine.world, body)
}

const spotIsClear = (x, y, radius = 34) => coinBodies.every((body) => Math.hypot(body.position.x - x, body.position.y - y) > radius)

const findReturnSpot = () => {

  if (spotIsClear(center, center)) return { x: center, y: center }

  for (let ring = 1; ring <= 4; ring += 1) {

    const radius = ring * 35

    for (let step = 0; step < 12; step += 1) {

      const angle = step * Math.PI / 6
      const x = center + Math.cos(angle) * radius
      const y = center + Math.sin(angle) * radius

      if (spotIsClear(x, y)) return { x, y }
    }
  }
  return { x: center, y: center }
}

const returnCoin = (body) => {

  const spot = findReturnSpot()
  Body.setPosition(body, spot)
  Body.setVelocity(body, { x: 0, y: 0 })
  Body.setAngularVelocity(body, 0)

  Sleeping.set(body, false)
  coinBodies.push(body)
  Composite.add(engine.world, body)
}

const pocketCoin = (body) => {

  if (!shotRecord || body.isPocketed) return
  body.isPocketed = true
  const firstRegular = shotRecord.pocketed.find((entry) => entry.type !== "queen")

  if (!firstRegular && body.coinType !== "queen" && body.coinType !== players[currentPlayer].piece) shotRecord.wrongFirst = true
  
  shotRecord.pocketed.push({ type: body.coinType, body })
  removeCoin(body)
  playSound("pocket", body.coinType === "queen" ? 0.68 : 0.52)
}

const pocketStriker = () => {

  if (!shotRecord || shotRecord.strikerPocketed) return

  shotRecord.strikerPocketed = true
  Composite.remove(engine.world, strikerBody)
  strikerInWorld = false

  strikerBody.collisionFilter.mask = 0
  playSound("pocket", 0.55)
}

const detectPockets = () => {
  const pocketPoints = [
    [playMin, playMin],
    [playMax, playMin],
    [playMin, playMax],
    [playMax, playMax]
  ]
  coinBodies.slice().forEach((body) => {
    const inside = pocketPoints.some(([x, y]) => Math.hypot(body.position.x - x, body.position.y - y) < 24)
    if (inside) pocketCoin(body)
  })

  if (strikerInWorld) {
    const strikerInside = pocketPoints.some(([x, y]) => Math.hypot(strikerBody.position.x - x, strikerBody.position.y - y) < 25)
    if (strikerInside) pocketStriker()
  }
}

const awardRegularCoins = (entries) => {

  entries.filter((entry) => entry.type !== "queen").forEach((entry) => {

    const owner = entry.type === "white" ? 0 : 1
    entry.body.isPocketed = true
    players[owner].pocketedBodies.push(entry.body)
    players[owner].score += 1
  })
}

const returnQueen = () => {
  if (!queenBody || coinBodies.includes(queenBody)) return

  queenBody.isPocketed = false
  returnCoin(queenBody)
  queenState.pendingPlayer = null
}

const coverQueen = (playerIndex) => {
  queenState.owner = playerIndex
  queenState.pendingPlayer = null
  players[playerIndex].score += 3
}

const applyFoulPenalty = (playerIndex) => {
  const player = players[playerIndex]
  const penaltyBody = player.pocketedBodies.pop()
  if (!penaltyBody) return false
  penaltyBody.isPocketed = false
  player.score = Math.max(0, player.score - 1)

  returnCoin(penaltyBody)
  return true
}

const finishShot = () => {

  const record = shotRecord
  const shooter = currentPlayer
  const ownEntries = record.pocketed.filter((entry) => entry.type === players[shooter].piece)
  const queenEntry = record.pocketed.find((entry) => entry.type === "queen")
  const foul = record.strikerPocketed || !record.touchedCoin || record.wrongFirst

  awardRegularCoins(record.pocketed)

  if (queenEntry) {
    if (foul) returnQueen()
    else if (ownEntries.length) coverQueen(shooter)
    else queenState.pendingPlayer = shooter
  } 
  
  else if (queenState.pendingPlayer === shooter) {
    if (!foul && ownEntries.length) coverQueen(shooter)
    else returnQueen()
  }

  if (foul) {
    const paid = applyFoulPenalty(shooter)
    if (record.strikerPocketed) lastRuling = paid ? "Striker foul · one coin returned" : "Striker foul · turn lost"
    else if (record.wrongFirst) lastRuling = paid ? "Wrong coin first · one coin returned" : "Wrong coin first · turn lost"
    else lastRuling = paid ? "No contact · one coin returned" : "No coin touched · turn lost"
    currentPlayer = 1 - currentPlayer
    playSound("foul", 0.58)
  }
  
  else if (queenState.pendingPlayer === shooter) {
    lastRuling = "Queen pocketed · cover it now"
  }
  
  else if (ownEntries.length) {
    lastRuling = queenEntry ? "Queen covered · shoot again" : "Own coin pocketed · shoot again"
  }
  
  else {
    lastRuling = "No own coin · turn passes"
    currentPlayer = 1 - currentPlayer
  }

  if (checkGameOver()) return
  prepareStriker()
}

const updateRack = (element, playerIndex) => {

  element.replaceChildren()

  players[playerIndex].pocketedBodies.forEach(() => {

    const coin = document.createElement("img")
    coin.className = "rack-coin"
    coin.alt = ""
    coin.src = playerIndex === 0 ? "assets/coin-white.png" : "assets/coin-black.png"
    element.appendChild(coin)
  })
}

const updateHud = () => {

  players.forEach((player, index) => {

    scoreElements[index].textContent = String(player.score).padStart(2, "0")
    playerPanels[index].classList.toggle("is-active", index === currentPlayer && phase !== "gameover")
    updateRack(rackElements[index], index)
  })

  turnNameElement.textContent = phase === "gameover" ? "Game over" : players[currentPlayer].name
  rulingElement.textContent = lastRuling
}

const checkGameOver = () => {

  const regularCoinsLeft = coinBodies.some((body) => body.coinType !== "queen")
  if (regularCoinsLeft || queenState.owner === null) return false
  phase = "gameover"

  const winner = players[0].score > players[1].score ? 0 : 1
  lastRuling = `${players[winner].name} wins the board`
  winnerElement.textContent = `${players[winner].name} wins`
  finalScoreElement.textContent = `${players[0].score} — ${players[1].score}`
  gameOverElement.hidden = false
  updateHud()
  return true
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

  if (phase === "moving") detectPockets()

  drawBoard()
  coinBodies.forEach((body) => drawSprite(body.coinType, body.position.x, body.position.y, coinSize))
  drawSprite("striker", strikerBody.position.x, strikerBody.position.y, strikerSize)
  drawAimGuide()

  if (phase === "moving" && time - shotStartedAt > 650 && allPiecesSettled()) finishShot()

  requestAnimationFrame(render)
}

render()
updateHud()