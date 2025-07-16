const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// Middle Ware
app.use(cors());
app.use(express.json());

// Firebase Admin
const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 🆕 Custom Middlewares
const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Header check
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized toekn Access" });
  }

  // Token check
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "token problem" });
  }

  // Verify the token

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(403).send({ message: "forbidden Access" });
  }
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

    // Collections
    // 👩 User Collection
    // 🍔 Meals Collection
    // 🥩 Upcomming Meals Collection
    const usersCollection = db.collection("users");
    const mealsCollection = db.collection("meals");
    const upcomingMealsCollection = db.collection("upcomingMeals");

    // 👩 User Collection
    // ✅ Post Users
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
    });

    // ✅ Get Users Collection
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.status(200).send(users);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    // ✅ Get Users by Search for making admin
    app.get("/users/search", async (req, res) => {
      const emailQuery = req.query.email;
      if (!emailQuery) {
        return res.status(400).send({ message: "Missing email query" });
      }

      const regex = new RegExp(emailQuery, "i");

      try {
        const users = await usersCollection
          .find({ email: { $regex: regex } })
          .project({ email: 1, createdAt: 1, role: 1 })
          .limit(10)
          .toArray();

        res.send(users);
      } catch (error) {
        console.error("Error searching users", error);
        res.status(500).send({ message: "Error searching users" });
      }
    });

    // ✅ User Role Update
    app.patch("/users/:id/role", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      if (!["admin", "user"].includes(role)) {
        return res.status(400).send({ message: "Invalid role, not match" });
      }

      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );
      } catch (error) {
        console.log(" Error updating user role ", error);
        res.status(500).send({ message: "Failed to update user role" });
      }
    });

    // 🍔 Meals Collection
    // ✅ Post The All Meals
    app.post("/meals", verifyFBToken, async (req, res) => {
      const meal = req.body;
      const result = await mealsCollection.insertOne(meal);

      res.send(result);
      console.log("Successfully Post the meals");
    });

    // ✅ Get all Meals with optional filters
    app.get("/meals", async (req, res) => {
      try {
        const { searchText, category, price } = req.query;

        const andConditions = [];

        if (searchText) {
          andConditions.push({
            $or: [
              { title: { $regex: searchText, $options: "i" } },
              { description: { $regex: searchText, $options: "i" } },
              { category: { $regex: searchText, $options: "i" } },
            ],
          });
        }

        if (category && category !== "All Categories") {
          andConditions.push({ category });
        }

        if (price) {
          andConditions.push({
            $expr: {
              $lte: [{ $toDouble: "$price" }, parseFloat(price)],
            },
          });
        }

        const query = andConditions.length ? { $and: andConditions } : {};

        const meals = await mealsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(meals);
      } catch (error) {
        console.log("Error fetching meals:", error);
        res.status(500).send({ message: "Failed to fetch meals Data" });
      }
    });



    // ✅ Get the meal Detail
    app.get("/meals/:id", async (req, res) => {
      const { id } = req.params;
      const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
      if (!meal) {
        return res.status(404).send({ message: "Meal not found" });
      }
      res.status(200).send(meal);
      console.log(`Meal with id ${id} fetched successfully`);
    });

    // ✅ Update the Meals
    app.put("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const meal = req.body;
      const updateDoc = {
        $set: {
          title: meal.title,
          category: meal.category,
          ingredients: meal.ingredients,
          description: meal.description,
          postTime: meal.postTime,
          price: meal.price,
          imageUrl: meal.imageUrl,
        },
      };

      const options = { upsert: true };
      const result = await mealsCollection.updateOne(
        filter,
        updateDoc,
        options
      );

      res.status(200).send(result);
      console.log(`Meal with id ${id} updated successfully`);
    });

    // ✅ Delete a group by id
    app.delete("/meals/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await mealsCollection.deleteOne(query);
      res.status(200).send(result);
      console.log(`Meal with id ${id} deleted successfully`);
    });

    // Liek Count Update
    // ✅ Like/Unlike a Meal (No token)
    app.post("/meals/:id/like", async (req, res) => {
      const id = req.params.id;
      const userId = req.body.userId;

      if (!userId) {
        return res.status(400).send({ message: "Missing userId" });
      }

      const filter = { _id: new ObjectId(id) };

      try {
        let meal = await mealsCollection.findOne(filter);

        if (!meal) {
          return res.status(404).send({ message: "Meal not found" });
        }

        if (!Array.isArray(meal.likes)) {
          await mealsCollection.updateOne(filter, { $set: { likes: [] } });
          meal.likes = [];
        }

        let update;
        if (meal.likes.includes(userId)) {
          update = { $pull: { likes: userId } };
        } else {
          update = { $addToSet: { likes: userId } };
        }

        await mealsCollection.updateOne(filter, update);

        const updatedMeal = await mealsCollection.findOne(filter);

        res.send({
          likesCount: updatedMeal.likes.length,
          liked: updatedMeal.likes.includes(userId),
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Error updating likes" });
      }
    });

    // 🥩Upcomming Meals Collection
    // ✅ Post The Upcomming Meals
    app.post("/upcomming-meals", async (req, res) => {
      const upcomingMeal = req.body;
      const result = await upcomingMealsCollection.insertOne(upcomingMeal);

      res.status(200).send(result);
      console.log("Successfully Post the upcomming meals");
    });

    // ✅ Get All Upcomming Meals
    app.get("/upcomming-meals", async (req, res) => {
      try {
        const upcomingMeal = await upcomingMealsCollection.find().toArray();
        res.status(200).send(upcomingMeal);
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to fetch upcoming meals" });
      }
    });

    // ✅ Update the Upcomming Meals
    app.put("/upcomming-meals/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const upcomingMeal = req.body;
      const updateDoc = {
        $set: {
          title: upcomingMeal.title,
          category: upcomingMeal.category,
          ingredients: upcomingMeal.ingredients,
          description: upcomingMeal.description,
          postTime: upcomingMeal.postTime,
          price: upcomingMeal.price,
          imageUrl: upcomingMeal.imageUrl,
        },
      };

      const options = { upsert: true };
      const result = await upcomingMealsCollection.updateOne(
        filter,
        updateDoc,
        options
      );

      res.status(200).send(result);
      console.log(`Upcomming Meal with id ${id} updated successfully`);
    });

    // ✅ Delete Upcomming Meal by Id
    app.delete("/upcomming-meals/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await upcomingMealsCollection.deleteOne(query);
      res.status(200).send(result);
      console.log(`Upcomming Meal with id ${id} Deleted Successfully`);
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
