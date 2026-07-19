# Zoho Notes Pro

**Zoho Notes Pro** is an interactive, web-based polyglot notebook application. It bridges the gap between traditional note-taking apps and full-fledged IDEs, providing a seamless platform to write notes, document code, and execute that code in the same cohesive workspace.

## 🌟 Why this project?

This project was built for developers, students, and educators who need a dynamic environment to learn, experiment, and document their work. Instead of juggling a note-taking app and a terminal or IDE, Zoho Notes Pro brings them together. It allows you to organize your thoughts with rich Markdown text and test code snippets side-by-side without needing complex local project setups.

## 🚀 Features

*   **Polyglot Execution:** Write and execute code in multiple languages directly in the browser: JavaScript, TypeScript, Python, Java, C, and C++.
*   **Interactive Notebooks:** A cell-based architecture where you can mix Markdown cells for rich text documentation and code cells for execution.
*   **VS Code Experience:** Powered by the Monaco Editor, offering IntelliSense, syntax highlighting, and smart auto-completion.
*   **Collaboration & Sharing:** Share your notes with others and collaborate effectively.
*   **Organization:** Group notes into hierarchical folders, label them, search through your workspace, and safely recover deleted items from the Trash.
*   **Customization:** Personalize your workspace with Dark/Light modes, Smart Output toggles, and default language preferences.
*   **Security & Auth:** Secure Google OAuth authentication and robust execution sandboxing.

## 💻 Tech Stack

*   **Frontend:** HTML/CSS/JS (Vanilla), Handlebars (hbs), Monaco Editor, Tailwind CSS, Lucide Icons.
*   **Backend:** Node.js, Express.js.
*   **Database:** MongoDB (Mongoose).

## 🛠️ Getting Started

Follow these steps to set up the project locally.

### Prerequisites

*   **Node.js** (v18.0.0 or higher)
*   **MongoDB** (Local instance or MongoDB Atlas)
*   **Compilers/Runtimes:** To execute specific languages locally, you must have their respective compilers/runtimes installed on your system path:
    *   **Python:** Python 3 (`python3` or `python`)
    *   **Java:** JDK (`javac`, `java`)
    *   **C/C++:** GCC/G++ (`gcc`, `g++`)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Fayasktr/zohoNotesPro.dev.git
    cd zohoNotesPro.dev
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file in the root of the project and configure the following variables:
    ```env
    PORT=3000
    MONGODB_URI=your_mongodb_connection_string
    SESSION_SECRET=your_secret_session_key
    
    # Google OAuth
    GOOGLE_CLIENT_ID=your_google_client_id
    GOOGLE_CLIENT_SECRET=your_google_client_secret
    
    # AI Features (Optional)
    GEMINI_API_KEY=your_gemini_api_key
    ```

4.  **Run the application:**
    ```bash
    npm start
    ```
    The app will be available at `http://localhost:3000`.

## 📖 Usage Guide

*   **Create a Note:** Click the **+** floating button to add a new code cell.
*   **Change Language:** Use the dropdown on a code cell to switch between JS, TS, Python, etc.
*   **Write Markdown:** Change the cell type to `Markdown` to write formatted text documentation.
*   **Run Code:** Click the **Run** button on a cell or press `Ctrl + Enter` to execute it and see the output immediately below.
*   **Copy All:** Use the copy button next to the notebook title to copy all your notes and code perfectly formatted.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page if you want to contribute.


