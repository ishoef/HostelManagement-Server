# 🛠️ UniHostel Server - Hostel Management System Backend

This is the **Express.js + MongoDB backend** for the **UniHostel** full-stack hostel management system. It provides a REST API to manage students, admins, meals, upcoming meals, reviews, and subscriptions. The backend uses **JWT** for secure authentication and supports Firebase for admin and user roles.

---

## 🌐 Live Server URL

**https://unihostel-server.onrender.com**

---

## 🚀 Features

- ✅ JWT-based secure authentication and authorization
- 🔐 Firebase Admin SDK integration for verifying user roles (admin, user)
- 🍽️ RESTful APIs for:
  - Meals
  - Upcoming Meals
  - Reviews
  - Users
  - Payment History
  - Premium Subscriptions
- ⚙️ Admin-only protected routes for meal and review management
- 🔄 Like system for meals and upcoming meals
- 📦 Meal requests and serve logic
- 🔍 Server-side search and sorting (username, email, likes, etc.)
- 📄 Pagination support for all dashboard tables (10 items/page)

---

## 🧪 Technologies Used

- **Node.js**
- **Express.js**
- **MongoDB + Mongoose**
- **Firebase Admin SDK**
- **jsonwebtoken (JWT)**
- **dotenv**
- **CORS & Helmet** for security

---

## 📁 Folder Structure

