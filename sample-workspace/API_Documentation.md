# API Documentation

## landing-page/server.js

### `POST /api/signup`

- **Framework:** express
- **Source:** landing-page/server.js:22

```bash
curl -X POST 'http://localhost:3000/api/signup'
```

## src/app.js

### `GET /api/users`

- **Framework:** express
- **Source:** src/app.js:5

```bash
curl -X GET 'http://localhost:3000/api/users'
```

### `POST /api/users`

- **Framework:** express
- **Source:** src/app.js:9
- **Request body fields:** name, email

```bash
curl -X POST 'http://localhost:3000/api/users' -H 'Content-Type: application/json' -d '{"name":"","email":""}'
```

### `GET /api/users/:id`

- **Framework:** express
- **Source:** src/app.js:14

```bash
curl -X GET 'http://localhost:3000/api/users/:id'
```

### `DELETE /api/users/:id`

- **Framework:** express
- **Source:** src/app.js:18

```bash
curl -X DELETE 'http://localhost:3000/api/users/:id'
```

## src/controllers/orders.controller.ts

### `GET /orders`

- **Framework:** nestjs
- **Source:** src/controllers/orders.controller.ts:5

```bash
curl -X GET 'http://localhost:3000/orders'
```

### `GET /orders/:id`

- **Framework:** nestjs
- **Source:** src/controllers/orders.controller.ts:10

```bash
curl -X GET 'http://localhost:3000/orders/:id'
```

### `POST /orders`

- **Framework:** nestjs
- **Source:** src/controllers/orders.controller.ts:15
- **Request body fields:** itemId, quantity

```bash
curl -X POST 'http://localhost:3000/orders' -H 'Content-Type: application/json' -d '{"itemId":"","quantity":""}'
```
