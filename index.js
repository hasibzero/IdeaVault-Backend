const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const jose = require("jose-cjs");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const { ObjectId } = require("mongodb");
dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
const cookieParser = require("cookie-parser");
app.use(cookieParser()); 
// Middleware
app.use(express.json());

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.BETTER_AUTH_URL,
  "http://localhost:3000",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);


let ideasCollection;


async function connectDB() {
  try {
    await client.connect();
    ideasCollection = client.db("ideavault").collection("ideas");
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
  }
}
connectDB();


const verifyToken = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const candidate = authHeader.split(" ")[1];
    if (candidate && candidate.trim()) {
      token = candidate.trim();
    }
  }
  if (!token && req.cookies) {
    token =
      req.cookies["better-auth.session_token"] ||
      req.cookies["better-auth.session_data"] ||
      null;
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    let payload;

    // Try RS256 via JWKS first — this is what better-auth's jwt() plugin uses
    try {
      const { payload: p } = await jwtVerify(token, JWKS);
      payload = p;
    } catch {
      // Fallback: HS256 with secret (for session cookie JWTs)
      if (!process.env.BETTER_AUTH_SECRET) {
        console.error("CRITICAL: BETTER_AUTH_SECRET is missing from backend environment!");
        return res.status(500).json({ message: "Server configuration error" });
      }
      const secret = new TextEncoder().encode(process.env.BETTER_AUTH_SECRET);
      const { payload: p } = await jwtVerify(token, secret);
      payload = p;
    }

    req.auth = payload;
    next();
  } catch (error) {
    console.error("JWT Verification Error:", error.message);
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid or expired token" });
  }
};


// --- ROUTES ---

app.patch("/ideas/:id/bookmark", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.auth?.sub || req.auth?.userId || req.body?.userId;

    if (!userId) {
      return res
        .status(400)
        .send({ error: "Unable to identify user for bookmark update" });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid idea id" });
    }

    const query = { _id: new ObjectId(id) };
    const idea = await ideasCollection.findOne(query);

    if (!idea) {
      return res.status(404).send({ error: "Idea not found" });
    }

    const bookmarks = Array.isArray(idea.bookmarks) ? idea.bookmarks : [];
    const isBookmarked = bookmarks.some(
      (bookmark) => String(bookmark) === String(userId),
    );

    const updateDoc = isBookmarked
      ? { $pull: { bookmarks: userId } }
      : { $addToSet: { bookmarks: userId } };
    await ideasCollection.updateOne(query, updateDoc);

    res.send({
      success: true,
      message: isBookmarked ? "Bookmark removed" : "Bookmarked successfully",
      isBookmarked: !isBookmarked,
    });
  } catch (error) {
    console.error("Error toggling bookmark:", error);
    res.status(500).send({ error: "Failed to update bookmark" });
  }
});

app.put("/ideas/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid idea id" });
    }

    const existingIdea = await ideasCollection.findOne({ _id: new ObjectId(id) });

    if (!existingIdea) {
      return res.status(404).send({ error: "Idea not found" });
    }

    const payload = req.body || {};
    const updateDoc = {
      $set: {
        project: {
          ...(existingIdea.project || {}),
          ...(payload.project || {}),
        },
        deep_dive: {
          ...(existingIdea.deep_dive || {}),
          ...(payload.deep_dive || {}),
        },
        metadata: {
          ...(existingIdea.metadata || {}),
          ...(payload.metadata || {}),
        },
        bookmarks: Array.isArray(payload.bookmarks)
          ? payload.bookmarks
          : existingIdea.bookmarks || [],
        discussion_summary: Array.isArray(payload.discussion_summary)
          ? payload.discussion_summary
          : existingIdea.discussion_summary || [],
        createdAt: payload.createdAt || existingIdea.createdAt,
        updatedAt: payload.updatedAt || new Date().toISOString(),
      },
    };

    const result = await ideasCollection.updateOne(
      { _id: new ObjectId(id) },
      updateDoc,
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ error: "Idea not found" });
    }

    const updatedIdea = await ideasCollection.findOne({ _id: new ObjectId(id) });

    res.send({
      success: true,
      message: "Idea updated successfully",
      idea: updatedIdea,
    });
  } catch (error) {
    console.error("Error updating idea:", error);
    res.status(500).send({ error: "Failed to update idea" });
  }
});



// Post comment 
app.post("/ideas/:id/comments", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.auth?.user?.id || req.auth?.session?.userId || req.auth?.userId || req.auth?.sub || req.auth?.id || req.body?.userId;
    const username = req.auth?.user?.name || req.auth?.name || req.body?.user || "Anonymous";
    const avatar = req.auth?.user?.image || req.auth?.image || req.body?.avatar || "";

    if (!comment || !comment.trim()) {
      return res.status(400).send({ error: "Comment text is required" });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid idea id" });
    }

    const commentId = new ObjectId().toString();
    const commentObj = {
      commentId,
      userId,
      user: username,
      avatar,
      comment: comment.trim(),
      createdAt: new Date().toISOString()
    };

    const query = { _id: new ObjectId(id) };
    const updateDoc = {
      $push: { discussion_summary: commentObj }
    };

    const result = await ideasCollection.updateOne(query, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(404).send({ error: "Idea not found" });
    }

    res.status(201).send({
      success: true,
      message: "Comment added successfully",
      comment: commentObj
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).send({ error: "Failed to add comment" });
  }
});

// Edit comment
app.put("/ideas/:id/comments/:commentId", verifyToken, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const { comment } = req.body;
    const userId = req.auth?.user?.id || req.auth?.session?.userId || req.auth?.userId || req.auth?.sub || req.auth?.id || req.body?.userId;

    if (!comment || !comment.trim()) {
      return res.status(400).send({ error: "Comment text is required" });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid idea id" });
    }

    const query = {
      _id: new ObjectId(id),
      "discussion_summary.commentId": commentId,
      "discussion_summary.userId": userId
    };

    const updateDoc = {
      $set: {
        "discussion_summary.$.comment": comment.trim(),
        "discussion_summary.$.updatedAt": new Date().toISOString()
      }
    };

    const result = await ideasCollection.updateOne(query, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(404).send({ error: "Idea or comment not found, or user unauthorized" });
    }

    res.send({
      success: true,
      message: "Comment updated successfully"
    });
  } catch (error) {
    console.error("Error updating comment:", error);
    res.status(500).send({ error: "Failed to update comment" });
  }
});

// Delete cmnt
app.delete("/ideas/:id/comments/:commentId", verifyToken, async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const userId = req.auth?.user?.id || req.auth?.session?.userId || req.auth?.userId || req.auth?.sub || req.auth?.id || req.body?.userId;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ error: "Invalid idea id" });
    }

    const query = {
      _id: new ObjectId(id),
      "discussion_summary.commentId": commentId,
      "discussion_summary.userId": userId
    };

    const updateDoc = {
      $pull: {
        discussion_summary: { commentId: commentId }
      }
    };

    const result = await ideasCollection.updateOne(query, updateDoc);
    if (result.matchedCount === 0) {
      return res.status(404).send({ error: "Idea or comment not found, or user unauthorized" });
    }

    res.send({
      success: true,
      message: "Comment deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).send({ error: "Failed to delete comment" });
  }
});

// Fetch Interactions page
app.get("/ideas/interactions/my", verifyToken, async (req, res) => {
  try {
    const userId = req.auth?.user?.id || req.auth?.session?.userId || req.auth?.userId || req.auth?.sub || req.auth?.id || req.query?.userId;

    if (!userId) {
      return res.status(400).send({ error: "Unable to identify user" });
    }


    const bookmarks = await ideasCollection.find({ bookmarks: userId }).toArray();


    const ideasWithUserComments = await ideasCollection.find({
      "discussion_summary.userId": userId
    }).toArray();

    const comments = [];

    ideasWithUserComments.forEach(idea => {
      if (Array.isArray(idea.discussion_summary)) {
        idea.discussion_summary.forEach(c => {
          if (String(c.userId) === String(userId)) {
            comments.push({
              commentId: c.commentId,
              ideaId: idea._id,
              ideaTitle: idea.project?.title || "Untitled Idea",
              comment: c.comment,
              createdAt: c.createdAt || idea.createdAt,
              user: c.user,
              avatar: c.avatar
            });
          }
        });
      }
    });


    comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.send({
      bookmarks,
      comments
    });

  } catch (error) {
    console.error("Error fetching interactions:", error);
    res.status(500).send({ error: "Failed to fetch interactions" });
  }
});

// ---

app.get("/categories", async (req, res) => {
  try {
    const [metaCats, plainCats, projCats] = await Promise.all([
      ideasCollection.distinct("metadata.category"),
      ideasCollection.distinct("category"),
      ideasCollection.distinct("project.category"),
    ]);

    const allCats = [...metaCats, ...plainCats, ...projCats].filter(Boolean);
    const cleanCategories = Array.from(new Set(allCats)).sort();

    res.send(cleanCategories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).send({ error: "Failed to fetch categories" });
  }
});

app.get("/ideas", async (req, res) => {
  try {
    const { search, category, time } = req.query;
    let query = {};

    if (search) {
      query["project.title"] = { $regex: search, $options: "i" };
    }

    if (category && category !== "All Categories") {
      query.$or = [
        { "metadata.category": category },
        { category: category },
        { "project.category": category },
      ];
    }

    if (time && time !== "Any Time") {
      const currentDate = new Date();
      let pastDate = new Date();

      if (time === "Past Week") pastDate.setDate(currentDate.getDate() - 7);
      if (time === "Past Month") pastDate.setMonth(currentDate.getMonth() - 1);
      if (time === "Past Year")
        pastDate.setFullYear(currentDate.getFullYear() - 1);

      query.createdAt = { $gte: pastDate.toISOString() };
    }

    const cursor = ideasCollection.find(query).sort({ createdAt: -1 });
    const result = await cursor.toArray();

    res.send(result);
  } catch (error) {
    console.error("Error fetching filtered ideas:", error);
    res.status(500).send({ error: "Failed to fetch ideas" });
  }
});

app.post("/ideas",verifyToken, async (req, res) => {
  // const header = req.headers.authorization;
  // console.log("Authorization header:", header);
  // if (!header) {
  //   return res.status(401).json({ message: "Unauthorized" });
  // }
  try {
    const newIdea = req.body;
    const result = await ideasCollection.insertOne(newIdea);
    res.status(201).send(result);
  } catch (error) {
    console.error("Error adding new idea:", error);
    res.status(500).send({ error: "Failed to add new idea" });
  }
  
});

app.delete("/ideas/:id",verifyToken, async (req, res) => {
  const { id } = req.params;

  const result = await ideasCollection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount === 0) {
    return res.status(404).send({ error: "Idea not found" });
  }
  res.send({ success: true, message: "Idea deleted successfully" });

  
});

app.get("/featured", async (req, res) => {
  const cursor = ideasCollection.find().limit(6);
  const result = await cursor.toArray();
  res.send(result);
});

app.get("/ideas/:ideaId", async (req, res) => {
  const { ideaId } = req.params;
  const idea = await ideasCollection.findOne({ _id: new ObjectId(ideaId) });
  if (!idea) {
    return res.status(404).send("Idea not found");
  }
  res.send(idea);
});

app.get("/", (req, res) => {
  res.send("IdeaVault Express Backend is Running!");
});

// --- START SERVER ---

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}

module.exports = app;
