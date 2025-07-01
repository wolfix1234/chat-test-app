import express from 'express'
import { Server } from "socket.io"
import path from 'path'
import { fileURLToPath } from 'url'
import http from 'http'
import minimist from 'minimist'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const argv = minimist(process.argv.slice(2))
const PORT = argv.p || process.env.PORT || 3500
const HOST = argv.H || '0.0.0.0'
const ADMIN = "Admin"

const app = express()
app.use(express.static(path.join(__dirname, "public")))

// ✅ This is the actual HTTP server for both Express and Socket.IO
const server = http.createServer(app)

server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`)
})

// --------- Users State ----------
const UsersState = {
    users: [],
    setUsers(newUsersArray) {
        this.users = newUsersArray
    }
}

// ✅ FIX: use the `server` here instead of `expressServer`
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["https://chat-test-app-flame.vercel.app"]
    }
})

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)
    socket.emit('message', buildMsg(ADMIN, "Welcome to Chat App!"))

    socket.on('enterRoom', ({ name, room }) => {
        const prevRoom = getUser(socket.id)?.room

        if (prevRoom) {
            socket.leave(prevRoom)
            io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`))
        }

        const user = activateUser(socket.id, name, room)

        if (prevRoom) {
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        socket.join(user.room)
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room`))
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has joined the room`))

        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })

        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeavesApp(socket.id)

        if (user) {
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))

            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }

        console.log(`User ${socket.id} disconnected`)
    })

    socket.on('message', ({ name, text }) => {
        const room = getUser(socket.id)?.room
        if (room) {
            io.to(room).emit('message', buildMsg(name, text))
        }
    })

    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room
        if (room) {
            socket.broadcast.to(room).emit('activity', name)
        }
    })
})

// --------- Utility Functions ----------
function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}

function activateUser(id, name, room) {
    const user = { id, name, room }
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id),
        user
    ])
    return user
}

function userLeavesApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}
