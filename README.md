# 📓 Zoho Notes

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-5.x-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-green.svg)](https://www.mongodb.com/)
[![PWA Ready](https://img.shields.io/badge/PWA-Supported-purple.svg)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Zoho Notes** is a modern, interactive web app that combines **note-taking** with **live code execution**. It works like a digital notebook where you can type explanations in rich Markdown and write executable code in multiple programming languages (JavaScript, Python, C++, Java, and more) inside the exact same page!

---

## 💡 What Makes Zoho Notes Special?

In standard note-taking apps, you can only write text or static code blocks. To test code, you usually have to open an IDE or terminal. 

**Zoho Notes changes that!**
- You get a cell-based notebook (similar to Jupyter Notebooks or Google Colab, but for web developers).
- Write notes and documentation using Markdown formatting.
- Add code cells and run them instantly with **one click** or `Ctrl + Enter`.
- Full VS Code editing experience powered by **Monaco Editor** with syntax highlighting and auto-completion.
- Works offline as a **Progressive Web App (PWA)**!

---

## 🌟 Key Features

| Feature | Description |
| :--- | :--- |
| ⚡ **Polyglot Code Execution** | Run JavaScript, TypeScript, Python, Java, C, and C++ code directly in your browser session. |
| 📝 **Interactive Cell Notebooks** | Mix documentation cells (Markdown) and execution cells (Code) seamlessly. |
| 🎨 **VS Code Editor Experience** | Embedded Monaco Editor with code autocomplete, line numbering, and bracket matching. |
| 🤖 **AI Assistant Integration** | Gemini AI service integration to assist with code explanations, summaries, and quest challenges. |
| 🔒 **Secure Authentication** | Native account signup/login plus optional Google OAuth 2.0 single sign-on. |
| 📱 **PWA & Mobile Support** | Installable on desktop and mobile devices with offline support via Service Workers. |
| 🗑️ **Trash & Note Recovery** | Safely store deleted notes in Trash and restore them whenever needed. |
| ⚙️ **Customizable Themes** | Toggle Light/Dark modes, Smart Output formatting, and default language settings. |

---

## 🛠️ Supported Programming Languages

Zoho Notes supports executing code in the following languages:

- 🟨 **JavaScript** (Node.js runtime)
- 🟦 **TypeScript** (via `ts-node`)
- 🐍 **Python** (Python 3 interpreter)
- ☕ **Java** (Open JDK compiler `javac` & runner `java`)
- 🔷 **C & C++** (GCC/G++ compiler toolchain)

> **Note:** For Python, Java, C, and C++ execution on your local machine, make sure their respective compilers/executors are installed on your system's PATH.

---

## 🏗️ Project Architecture & Structure

Below is an overview of the directory organization in Zoho Notes:

```
zohoNotes/
├── app.js                 # Main Express application entry point
├── Dockerfile             # Docker container definition
├── render.yaml            # Render cloud deployment specification
├── package.json           # Node.js dependencies and script definitions
│
├── controllers/           # Route logic handlers (Admin, Game, User, Notes)
├── engine/                # Polyglot code execution & sandboxing engine
├── models/                # MongoDB Mongoose data schemas (User, Note, Quest)
├── routes/                # Express router endpoints
├── services/              # Background services (AI, Cron jobs, Mailer)
│
├── public/                # Static frontend assets
│   ├── css/               # Application stylesheets
│   ├── js/                # Client-side scripts (PWA, Monaco notebook runner)
│   ├── images/            # App icons, logos, and PWA assets
│   ├── manifest.json      # Progressive Web App manifest
│   └── sw.js              # Service Worker for offline capability
│
├── views/                 # Handlebars (hbs) template pages & layouts
│   ├── admin/             # Admin portal dashboards
│   ├── game/              # Gamified coding quests & maps
│   └── partials/          # Reusable Handlebars template partials
│
└── scripts/               # Utility scripts (Seeding, icon generators)
```

---

## 🚀 Quick Start Guide

Follow these simple steps to set up and run Zoho Notes on your local machine.

### Prerequisites

Ensure you have the following software installed:
1. **Node.js**: Version 18.0.0 or higher ([Download Node.js](https://nodejs.org/))
2. **MongoDB**: Local MongoDB server or a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster database.

---

### Step 1: Clone the Repository

Open your terminal and clone the repository:
```bash
git clone https://github.com/Fayasktr/zohoNotesPro.dev.git
cd zohoNotesPro.dev
```

---

### Step 2: Install Dependencies

Install all required Node.js packages:
```bash
npm install
```

---

### Step 3: Configure Environment Variables

Create a `.env` file in the root directory (you can copy `.env.example` as a template):

```bash
cp .env.example .env
```

Open `.env` in your code editor and fill in your details:

```env
# Server Port & Mode
PORT=3000
NODE_ENV=development

# Session Security Key (Choose any long random string)
SESSION_SECRET=your-super-secret-key-here

# MongoDB Database Connection URL
MONGODB_URI=mongodb://localhost:27017/zoho_notes

# Google OAuth Credentials (Optional - for Google Login)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Gemini AI API Key (Optional - for AI coding assistant features)
GEMINI_API_KEY=your_gemini_api_key

# Nodemailer Email Settings (Optional - for Password Reset emails)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
```

---

### Step 4: Run the Application

Start the local server:

```bash
npm start
```

For development mode:
```bash
npm run dev
```

Open your browser and navigate to:
👉 **`http://localhost:3000`**

---

## 📖 How to Use Zoho Notes

1. **Sign Up / Log In**: Create an account or log in with your credentials.
2. **Create a New Notebook**: Click the **+** button to create a new note cell.
3. **Select Language**: Click the language dropdown on any cell to switch between JavaScript, Python, C++, Java, etc.
4. **Write Code & Documentation**: Toggle cells between `Code` mode and `Markdown` mode.
5. **Run Code**: Press **Run** or use the quick keyboard shortcut `Ctrl + Enter` (`Cmd + Enter` on Mac) to execute the cell and view output directly below!
6. **Organize & Manage**: Create folders, search your notes, share note links, or move items to Trash.

---

## 🚢 Deployment Guide

### Option 1: Deploy on Render
This project includes a pre-configured [`render.yaml`](file:///c:/Users/FAYAS/Desktop/zoho%20note%20compailor/render.yaml) file.
1. Push your code to GitHub.
2. Log into [Render](https://render.com/).
3. Connect your repository — Render will automatically read `render.yaml` and set up the service!

### Option 2: Docker Containerization
A [`Dockerfile`](file:///c:/Users/FAYAS/Desktop/zoho%20note%20compailor/Dockerfile) is included to containerize the app easily.

Build the Docker image:
```bash
docker build -t zoho-notes .
```

Run the container:
```bash
docker run -p 3000:3000 --env-file .env zoho-notes
```

---

## 🧪 Code Validation & Testing

To verify JavaScript syntax across the project:
```bash
npm run check
```

---

## 🤝 Contributing

Contributions are always welcome! If you'd like to improve Zoho Notes:
1. Fork the project repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 👤 Author

**Fayas KP**
- GitHub: [@Fayasktr](https://github.com/Fayasktr)

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE).
