# KK Pharma - Multi-Branch Pharmacy Management System

A robust, real-time pharmacy management system built with the MERN stack (MongoDB, Express, React, Node.js) and TanStack Start. This system features centralized admin control, multi-branch support, real-time POS, and automated expiry monitoring.

## 🚀 Features

- **Real-time POS**: Fast checkout with automated stock deduction and mandated price enforcement.
- **Admin Control**: Centralized medicine management and mandated pricing across all branches.
- **Expiry Guard**: Automated alerts for medicines expiring within 30 days and blocking of near-expiry dispatches.
- **Smart Analytics**: Real-time dashboards for both Admin and Branch users.
- **Real-time Updates**: Socket.io integration for instant inventory and status updates.

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v18 or higher)
- [MongoDB](https://www.mongodb.com/try/download/community) (Running locally or a Cloud URI)
- [npm](https://www.npmjs.com/) or [bun](https://bun.sh/)

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/5th-collab-lord/pharma.git
   cd pharma
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   ```
   Create a `.env` file in the `backend` folder:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/kk_pharma
   JWT_SECRET=your_super_secret_key
   ADMIN_EMAIL=admin@kkpharma.com
   ADMIN_PASSWORD=admin123
   CLIENT_URL=http://localhost:8081
   ```

3. **Frontend Setup**
   ```bash
   cd ../frontend
   npm install
   ```
   Create a `.env` file in the `frontend` folder:
   ```env
   VITE_API_URL=http://localhost:5000
   ```

## 🚦 Running the Application

### Option 1: Run separately (Recommended for development)

**Start the Backend:**
```bash
cd backend
npm run dev
```

**Start the Frontend:**
```bash
cd frontend
npm run dev
```
The application will be available at `http://localhost:8081`.

### Option 2: Production Build
```bash
cd frontend
npm run build
```

## 🔐 Default Credentials
- **Admin Portal**: `admin@kkpharma.com` / `admin123`
- **Branch Portal**: Register as a new shop user and wait for Admin approval.

## 📝 License
This project is licensed under the MIT License.
