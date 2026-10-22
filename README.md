# VocaRead — Document Reader & Study Assistant

VocaRead is a web-based document reading and study application designed to make learning more accessible and efficient. It helps users process study materials, listen to document content using text-to-speech, and interact with learning-focused tools through a simple interface.

## ✨ Features

- **Document Upload & Extraction:** Process supported document formats, including PDF, DOCX, text files, and images, using dedicated extraction utilities.
- **Text-to-Speech:** Listen to document content through browser-based speech synthesis.
- **Voice Controls:** Control reading through supported voice commands, including playback, pause, resume, repeat, and navigation.
- **Interactive Reading:** View structured document content and follow the reading experience through the application interface.
- **Document Library:** Save, continue, rename, and manage documents stored in MongoDB under the signed-in account.
- **Study Workspace:** Ask document-grounded questions and generate, take, and review saved assessments linked to your account.
- **Modular Architecture:** Separate React components and document-processing utilities make the application easier to maintain and extend.

## 🛠️ Tech Stack

### Frontend
- React.js
- Vite
- JavaScript
- HTML5 and CSS3
- Web Speech API
- Browser-based document processing utilities

### Backend
- Node.js
- Express.js
- JavaScript
- REST API routes for study-related functionality
- MongoDB Atlas for accounts and server-side sessions

### Authentication setup

1. In MongoDB Atlas, create a database user, allow your development IP in Network Access, and copy the application connection string.
2. Copy `backend/.env.example` to `backend/.env`, then set `MONGODB_URI`, a long random `SESSION_SECRET`, and your Gemini settings. Keep `.env` private and never commit it.
3. Start the backend with `npm run server` from the project root and the frontend with `npm run dev` in another terminal. Vite forwards `/api` requests to the backend.
4. Register through the app. Passwords are stored as bcrypt hashes, and login state uses an HTTP-only session cookie stored in MongoDB.

For deployment, set `CLIENT_ORIGIN` to the frontend's exact origin (comma-separated if needed) and serve the frontend and backend over HTTPS.

### Planned Enhancements
- Expanded AI-assisted study features
- Improved document organization and learning analytics
- Production deployment

> Note: The planned enhancements will be marked as implemented only after they are integrated and tested.

## 📁 Project Structure

```text
VocaRead/
├── backend/
│   ├── server.js
│   ├── studyRoutes.js
│   ├── package.json
│   └── .gitignore
├── public/
├── src/
│   ├── components/
│   ├── pages/
│   ├── utils/
│   ├── assets/
│   ├── App.jsx
│   ├── App.css
│   └── main.jsx
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

## ⚙️ Prerequisites

Before running VocaRead locally, install:

- [Node.js](https://nodejs.org/) — use a version compatible with the project dependencies.
- npm — included with Node.js.
- [Git](https://git-scm.com/) — for cloning and version control.

Check your installation:

```bash
node -v
npm -v
git --version
```

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd VocaRead
```

Replace the placeholder with the HTTPS URL of your GitHub repository.

### 2. Install frontend dependencies

From the project root:

```bash
npm install
```

### 3. Install backend dependencies

```bash
cd backend
npm install
```

### 4. Configure environment variables

If the backend requires environment variables, create a `.env` file inside the `backend/` directory.

Use the exact variable names expected by the backend source code. Store database connection strings and API keys in environment variables rather than hardcoding them in source files.

Never commit real credentials or secret keys to GitHub.

### 5. Start the backend

From the `backend/` directory, run:

```bash
node server.js
```

Keep this terminal running. If your backend defines a different startup command in `backend/package.json`, use that command instead.

### 6. Start the frontend

Open a second terminal, navigate to the project root, and run:

```bash
npm run dev
```

Open the local URL printed by Vite in your terminal, commonly `http://localhost:5173`.

If the frontend makes requests to the backend, ensure the backend is running and the API URL and CORS configuration match your local setup.

## 📖 How to Use VocaRead

1. Open the application in your browser.
2. Upload a supported document or enter text through the available interface.
3. Review the extracted or structured content.
4. Use the reading controls to start, pause, resume, repeat, or navigate through spoken content.
5. Explore the document library and study workspace where available.

Some browser-based speech and voice-recognition features depend on browser support and microphone permissions.

## 🔒 Security & Privacy

- Keep `.env` files and credentials out of version control.
- Validate uploaded files and handle unsupported formats safely.
- Do not expose private API keys in frontend code.
- Review the application's storage behavior before uploading sensitive documents.

## 🗺️ Roadmap

- [x] Add MongoDB Atlas account and session storage with registration, login, and logout.
- [x] Store documents, study indexes, assessments, and submitted attempts in MongoDB per user.
- [x] Migrate existing browser-saved documents and assessments to the signed-in account.
- [ ] Improve document management and learning analytics.
- [ ] Expand AI-assisted study and document-understanding capabilities.
- [ ] Add automated tests for document processing and backend routes.
- [ ] Deploy the application with production-ready configuration.

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Implement and test your changes.
4. Submit a pull request describing the changes.

## 📄 License

A license has not yet been specified. Add an appropriate license before presenting the project as open source.

---

**VocaRead** — Making document reading and studying more accessible.
