const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Middle Ware
app.use(cors());
app.use(express.json());

// Custom Middlewares
const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.Authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized Access" });
  }

  next();
};

// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@hobbyshop.bhkkg8e.mongodb.net/?retryWrites=true&w=majority&appName=HobbyShop`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("UniHostel");
    const usersCollection = db.collection("users");
    // User Collection

    // Post Users
    app.post("/users", async (req, res) => {
      const email = req.body.email;

      const existUser = await usersCollection.findOne({ email });
      if (existUser) {
        return res
          .status(500)
          .send({ message: "user already exists", inserted: false });
      }

      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);

      console.log(result);
      console.log(user);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Sample Route
app.get("/", (req, res) => {
  console.log("Hotel Server is running");
  res.send("Hotel Server is running");
});

// Start The Server
app.listen(port, () => {
  console.log(`server is running on the ${port}`);
});
