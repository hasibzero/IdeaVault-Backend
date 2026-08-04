const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const { ObjectId } = require("mongodb");
dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

// Create a global variable for your collection so routes can access it
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

// --- ROUTES ---

app.patch("/ideas/:id/bookmark", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res
        .status(400)
        .send({ error: "userId is required in the request body" });
    }
    const query = { _id: new ObjectId(id) };
    const idea = await ideasCollection.findOne(query);

    if (!idea) {
      return res.status(404).send({ error: "Idea not found" });
    }

    const bookmarks = idea.bookmarks || [];
    const isBookmarked = bookmarks.includes(userId);

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

app.get("/categories", async (req, res) => {
  try {
    const categories = await ideasCollection.distinct("metadata.category");

    const cleanCategories = categories.filter(Boolean);

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
      query["metadata.category"] = category;
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

app.post("/ideas", async (req, res) => {
  try {
    const newIdea = req.body;
    const result = await ideasCollection.insertOne(newIdea);
    res.status(201).send(result);
  } catch (error) {
    console.error("Error adding new idea:", error);
    res.status(500).send({ error: "Failed to add new idea" });
  }
});

app.get("/featured", async (req, res) => {
  const cursor = ideasCollection.find().limit(4);
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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
