# ⚡ IdeaVault — Express.js Backend API

The IdeaVault backend is a fast, flexible, and robust **Node.js & Express.js** REST API designed to power the IdeaVault platform. It connects with **MongoDB Atlas**, verifies secure session tokens issued by **Better Auth (RS256 JWKS & HS256 JWT validation)**, and exposes optimized endpoints for managing project ideas, user interactions, bookmarks, and threaded discussions.

---



---

## ✨ Key Features

1. **🛡️ Advanced Dual Token Verification (JWKS & HS256 Auth)**
   - Custom `verifyToken` middleware supporting both remote RS256 JWKS key validation (Better Auth JWT plugin) and HS256 secret fallback for session cookie decoding.
   - Restricts non-authenticated access across protected routes while seamlessly identifying user identity across requests.

2. **📌 Instant Bookmark Synchronization API**
   - Atomic `$addToSet` and `$pull` operations for user bookmark toggling on ideas.
   - Prevents duplicate bookmarks and maintains real-time user-idea mapping in MongoDB.

3. **💬 Threaded Comment & Discussion Engine**
   - Full CRUD operations for idea discussions: post new comments, edit existing comments, and delete comments with owner verification (`userId` authorization).
   - Generates unique comment IDs (`commentId`) and embeds full user profile metadata (avatar, name, timestamps).

4. **📊 Dynamic Query Filtering & Category Aggregation**
   - Multi-field search endpoint supporting regex pattern matching across project titles, taglines, and descriptions.
   - Supports multi-dimensional filtering by category and date ranges (`Past Week`, `Past Month`, `Past Year`), along with distinct category aggregation queries.

5. **👤 Personal Interactions Dashboard API (`/ideas/interactions/my`)**
   - Aggregated endpoint that compiles a logged-in user's bookmarked ideas and historical comments in a single payload.
   - Sorts user comments chronologically for fast rendering in the frontend interactions view.

---

## 🛠️ Tech Stack & Dependencies

- **Runtime**: Node.js
- **Framework**: Express.js (`v5`)
- **Database**: MongoDB Atlas (`mongodb` driver v7.5)
- **Authentication & Security**: `jose-cjs` (JWKS & JWT verification), `cookie-parser`, `cors`, `dotenv`
- **Deployment**: Vercel Serverless Functions (`vercel.json` rewrite configured)

---

## 🚀 Getting Started

### Prerequisites

- Node.js `v18.x` or higher
- MongoDB Atlas database cluster

### Environment Setup

Create a `.env` file in the `ideavault-server` root directory (refer to `.env.example`):

```env
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?appName=Cluster0
CLIENT_URL=http://localhost:3000
BETTER_AUTH_SECRET=your_better_auth_secret_here
```

### Installation & Local Run

```bash
# Install dependencies
npm install

# Start local Express server
node index.js
```

The API will be running locally at `http://localhost:5000`. Test the main endpoint at `http://localhost:5000/`.
