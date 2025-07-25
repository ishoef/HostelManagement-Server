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
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);

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
    console.log("Authorization header not found");
    return res.status(401).send({ message: "unauthorized token Access" });
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
    console.log("Error verifying token:", error);
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
    // 💳 Payment Collection
    // 🍴 Meal Request Collection
    const usersCollection = db.collection("users");
    const mealsCollection = db.collection("meals");
    const upcomingMealsCollection = db.collection("upcomingMeals");
    const paymentsCollection = db.collection("payments");
    const mealRequestsCollection = db.collection("mealRequests");

    // 🆕 Verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);

      if (!user || user.role !== "admin") {
        console.log("User is not an admin");
        return res.status(403).send({ message: "forbidden Access" });
      }

      next();
    };

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

    // ✅ Get Users Collection with Pagination
    app.get("/users", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const total = await usersCollection.estimatedDocumentCount(); // total users
        const users = await usersCollection
          .find()
          .skip(skip)
          .limit(limit)
          .toArray();

        res.status(200).send({
          users,
          total,
          page,
          pages: Math.ceil(total / limit),
        });
      } catch (error) {
        console.log(error);
        res.status(500).send({ message: "Failed to fetch users" });
      }
    });

    // ✅ Get Users by Search for making admin
    app.get("/users/search", verifyFBToken, verifyAdmin, async (req, res) => {
      const emailQuery = req.query.email;
      if (!emailQuery) {
        return res.status(400).send({ message: "Missing email query" });
      }

      const regex = new RegExp(emailQuery, "i");

      try {
        const users = await usersCollection
          .find({ email: { $regex: regex } }) // regex: regular expration
          // .project({ email: 1, createdAt: 1, role: 1 })
          .limit(10)
          .toArray();

        res.send(users);
      } catch (error) {
        console.error("Error searching users", error);
        res.status(500).send({ message: "Error searching users" });
      }
    });

    // ✅ User Role Update
    app.patch("/users/:id/role", verifyFBToken, async (req, res) => {
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

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Role updated successfully" });
        } else {
          res.status(404).send({
            success: false,
            message: "User not found or role unchanged",
          });
        }
      } catch (error) {
        console.log(" Error updating user role ", error);
        res.status(500).send({ message: "Failed to update user role" });
      }
    });

    // ✅  GET: Get User Role by Email
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;
        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ role: user.role || "user" });
      } catch (error) {
        console.error("Error fetching user role", error);
        res.status(500).send({ message: "Error fetching user role" });
      }
    });

    // ✅ Get User by Email
    app.get("/user/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await usersCollection.findOne({ email: email });

        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send(user);
      } catch (error) {
        console.error("Error fetching user by email:", error);
        res.status(500).send({ message: "Error fetching user" });
      }
    });

    // ✅ Update user Subscription Status
    app.put("/users/:email", async (req, res) => {
      const { email } = req.params;
      const updateData = req.body;

      try {
        const result = await usersCollection.updateOne(
          { email: email },
          { $set: updateData },
          { upsert: true }
        );

        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
          res.send({
            success: true,
            message: "User data updated successfully",
          });
        } else {
          res.status(404).send({
            success: false,
            message: "User not found or no changes made",
          });
        }
      } catch (error) {
        console.error("Error updating user data", error);
        res.status(500).send({ message: "Error updating user data" });
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
       const { page = 1, limit = 10, searchText, category, price } = req.query;

       const query = {};
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

       if (andConditions.length) {
         query.$and = andConditions;
       }

       const total = await mealsCollection.countDocuments(query);

       const meals = await mealsCollection
         .find(query)
         .sort({ createdAt: -1 })
         .skip((parseInt(page) - 1) * parseInt(limit))
         .limit(parseInt(limit))
         .toArray();

       res.status(200).send({
         data: meals,
         totalMeals: total,
       });
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

    // 🆕 Riviews Store
    // ✅ Post a Review
    app.post("/meals/:id/review", async (req, res) => {
      const mealId = req.params.id;
      const { userId, rating, comment, name, email, mealName, likes } =
        req.body;

      console.log("Review data:", {
        mealId,
        userId,
        rating,
        comment,
        name,
        email,
        mealName,
        likes,
      });

      if (
        !userId ||
        !rating ||
        !comment ||
        !name ||
        !email ||
        !mealName ||
        !likes
      ) {
        return res.status(400).send({ message: "Missing required fields" });
      }

      try {
        const meal = await mealsCollection.findOne({
          _id: new ObjectId(mealId),
        });

        if (!meal) {
          return res.status(404).send({ message: "Meal not found" });
        }

        const newReview = {
          userId,
          name,
          email,
          rating: parseFloat(rating),
          comment,
          mealName,
          likes,
          date: new Date().toLocaleString(), // You can customize this format
        };

        // 1️⃣ Add review
        await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          {
            $push: { reviews: newReview },
            $inc: { reviews_count: 1 },
          }
        );

        // 2️⃣ Recalculate rating
        const updatedMeal = await mealsCollection.findOne({
          _id: new ObjectId(mealId),
        });

        const totalRatings =
          updatedMeal.reviews?.reduce((sum, r) => sum + r.rating, 0) || 0;
        const reviewCount = updatedMeal.reviews?.length || 0;
        const averageRating = reviewCount ? totalRatings / reviewCount : 0;

        // 3️⃣ Update rating
        await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          {
            $set: {
              rating: parseFloat(averageRating.toFixed(1)),
            },
          }
        );

        const finalMeal = await mealsCollection.findOne({
          _id: new ObjectId(mealId),
        });

        res.send({
          success: true,
          message: "Review submitted and rating updated",
          meal: finalMeal,
        });
      } catch (error) {
        console.error("Error submitting review:", error);
        res.status(500).send({ message: "Failed to submit review" });
      }
    });

    // ✅ Get Reviews by Meal ID
    app.get("/admin/reviews", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const meals = await mealsCollection
          .find({}, { projection: { name: 1, reviews: 1 } })
          .toArray();

        const allReviews = [];

        meals.forEach((meal) => {
          meal.reviews?.forEach((review, index) => {
            allReviews.push({
              mealId: meal._id,
              mealName: meal.name,
              ...review,
              index,
            });
          });
        });

        allReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

        const paginatedReviews = allReviews.slice(skip, skip + limit);

        res.send({
          total: allReviews.length,
          reviews: paginatedReviews,
        });
      } catch (err) {
        console.error("Failed to get reviews:", err);
        res.status(500).send({ message: "Failed to load reviews" });
      }
    });

    // ✅ Get Reviews for specific user (by email)
    app.get("/user/my-reviews/:email", async (req, res) => {
      const userEmail = req.params.email;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;

      if (!userEmail) {
        return res.status(400).send({ message: "Missing user email" });
      }

      try {
        const allMeals = await mealsCollection
          .find(
            { "reviews.email": userEmail },
            { projection: { name: 1, reviews: 1 } }
          )
          .toArray();

        const userReviews = [];

        allMeals.forEach((meal) => {
          meal.reviews?.forEach((review, index) => {
            if (review.email === userEmail) {
              userReviews.push({
                mealId: meal._id,
                mealName: meal.name,
                index,
                ...review,
              });
            }
          });
        });

        // Sort newest to oldest
        userReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Paginate
        const startIndex = (page - 1) * limit;
        const paginatedData = userReviews.slice(startIndex, startIndex + limit);

        res.send({
          currentPage: page,
          totalReviews: userReviews.length,
          totalPages: Math.ceil(userReviews.length / limit),
          reviews: paginatedData,
        });
      } catch (error) {
        console.error("Failed to fetch user reviews:", error);
        res.status(500).send({ message: "Failed to get user reviews" });
      }
    });

    // ✅ Delete a Review by User
    app.delete("/user/reviews/:mealId/:index", async (req, res) => {
      const { mealId, index } = req.params;

      try {
        const meal = await mealsCollection.findOne({
          _id: new ObjectId(mealId),
        });

        if (!meal || !meal.reviews || !meal.reviews.length) {
          return res.status(404).send({ message: "Meal or reviews not found" });
        }

        // Ensure index is within bounds
        const reviewIndex = parseInt(index);
        if (
          isNaN(reviewIndex) ||
          reviewIndex < 0 ||
          reviewIndex >= meal.reviews.length
        ) {
          return res.status(400).send({ message: "Invalid review index" });
        }

        // Remove the review at the specified index
        meal.reviews.splice(reviewIndex, 1);

        // Update the meal document
        await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          {
            $set: { reviews: meal.reviews },
            $inc: { reviews_count: -1 },
          }
        );

        // Recalculate average rating
        const totalRatings = meal.reviews.reduce(
          (sum, r) => sum + parseFloat(r.rating || 0),
          0
        );
        const averageRating =
          meal.reviews.length > 0 ? totalRatings / meal.reviews.length : 0;

        await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          {
            $set: {
              rating: parseFloat(averageRating.toFixed(1)),
            },
          }
        );

        res.send({ success: true, message: "Review deleted successfully" });
      } catch (error) {
        console.error("Failed to delete review:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // ✅ Update a Review by Meal ID and Index
    app.put("/user/reviews/:mealId/:index", async (req, res) => {
      const { mealId, index } = req.params;
      const { rating, comment } = req.body;

      try {
        const meal = await mealsCollection.findOne({
          _id: new ObjectId(mealId),
        });
        if (!meal) return res.status(404).send({ message: "Meal not found" });

        if (!meal.reviews || !meal.reviews[index])
          return res.status(400).send({ message: "Invalid review index" });

        meal.reviews[index].rating = parseFloat(rating);
        meal.reviews[index].comment = comment;

        // Recalculate average rating
        const totalRating = meal.reviews.reduce((sum, r) => sum + r.rating, 0);
        const avg = meal.reviews.length ? totalRating / meal.reviews.length : 0;

        await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          {
            $set: {
              reviews: meal.reviews,
              rating: parseFloat(avg.toFixed(1)),
            },
          }
        );

        res.send({ success: true, message: "Review updated" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // ✅ Delete a Review by Meal ID and Index
    // DELETE review from a meal
    app.delete("/admin/reviews/:mealId/:reviewIndex", async (req, res) => {
      const { mealId, reviewIndex } = req.params;

      try {
        const meal = await mealsCollection.findOne({
          _id: new ObjectId(mealId),
        });

        if (!meal) return res.status(404).send({ message: "Meal not found" });

        const reviews = meal.reviews || [];

        if (reviewIndex < 0 || reviewIndex >= reviews.length) {
          return res.status(400).send({ message: "Invalid review index" });
        }

        // Remove review at index
        reviews.splice(reviewIndex, 1);

        // Recalculate average rating
        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const newRating = reviews.length ? totalRating / reviews.length : 0;

        await mealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          {
            $set: {
              reviews: reviews,
              rating: parseFloat(newRating.toFixed(1)),
              reviews_count: reviews.length,
            },
          }
        );

        res.send({ success: true, message: "Review deleted" });
      } catch (err) {
        console.error("Failed to delete review:", err);
        res.status(500).send({ message: "Internal server error" });
      }
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
        const page = parseInt(req.query.page) || 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : null;
        const skip = limit ? (page - 1) * limit : 0;

        const total = await upcomingMealsCollection.countDocuments();

        let cursor = upcomingMealsCollection.find();

        if (limit) {
          cursor = cursor.skip(skip).limit(limit);
        }

        const meals = await cursor.toArray();

        res.status(200).send({
          total,
          page,
          limit: limit || total, // if no limit, return total as "limit"
          meals,
        });
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

    // ✅ POST: Manual Publish an Upcoming Meal
    app.post("/publish-upcoming-meal/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const upcomingMeal = await upcomingMealsCollection.findOne({
          _id: new ObjectId(id),
        });
        console.log(upcomingMeal);
        // Check if the upcoming meal exists
        if (!upcomingMeal) {
          return res.status(404).send({ message: "Upcoming meal not found" });
        }

        // Add to meals Collection
        await mealsCollection.insertOne(upcomingMeal);

        // Remove form upcomingMealsCollection
        await upcomingMealsCollection.deleteOne({ _id: new ObjectId(id) });

        res
          .status(200)
          .send({ success: true, message: "Meal Published Successfully" });
      } catch (error) {
        console.log("Error publishing upcoming meal:", error);
        res.status(500).send({ message: "Failed to publish meal" });
      }
    });

    // ✅ PATCH: Publish The Upcoming Meal when gains 10 Likes
    app.patch("/upcomming-meals/like/:id", async (req, res) => {
      const mealId = req.params.id;
      const userId = req.body.userId;

      try {
        const meal = await upcomingMealsCollection.findOne({
          _id: new ObjectId(mealId),
        });
        if (!meal) return res.status(404).send({ message: "Meal not found" });

        let likes = Array.isArray(meal.likes) ? meal.likes : [];

        let updated;
        let liked;

        if (likes.includes(userId)) {
          likes = likes.filter((id) => id !== userId); // Unlike
          liked = false;
        } else {
          likes.push(userId); // Like
          liked = true;
        }

        // Update the likes
        await upcomingMealsCollection.updateOne(
          { _id: new ObjectId(mealId) },
          { $set: { likes } }
        );

        // Auto-publish if likes hit 10 after a new like
        if (liked && likes.length >= 10) {
          meal.createdAt = new Date();
          await mealsCollection.insertOne(meal);
          await upcomingMealsCollection.deleteOne({
            _id: new ObjectId(mealId),
          });
          return res.send({
            success: true,
            published: true,
            message: "Meal auto-published!",
            likesCount: 10,
            liked,
          });
        }

        res.send({
          success: true,
          published: false,
          message: liked ? "Liked successfully" : "Unliked successfully",
          likesCount: likes.length,
          liked,
        });
      } catch (err) {
        console.error("Like error:", err);
        res.status(500).send({ message: "Error processing like" });
      }
    });

    // 💳 Payments Information
    // ✅ Payment Gateway Integration
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      console.log(price);

      const result = req.body;
      console.log(result);
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: price,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ✅ Store Payment Information in the mongoDB
    app.post("/payments", async (req, res) => {
      const paymentData = req.body;
      console.log("Payment Data:", paymentData);
      try {
        const result = await paymentsCollection.insertOne(paymentData);
        res.send({
          success: true,
          message: "Payment recorded successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to record payment" });
      }
    });

    // ✅ GET: Get the Payment
    app.get("/payments/:email", async (req, res) => {
      const userEmail = req.params.email;

      try {
        const payments = await paymentsCollection
          .find({ email: userEmail })
          .sort({ date: -1 }) // optional: latest first
          .toArray();

        res.send(payments);
      } catch (error) {
        console.error("Failed to fetch payment history:", error);
        res.status(500).json({ error: "Failed to fetch payments" });
      }
    });

    // 🍚 Meal Request by User
    // ✅ POST Meal Requests
    app.post("/meals/:mealId/request", async (req, res) => {
      const { mealId } = req.params;
      const { userId, name, mealName, email, isSubscribed } = req.body;

      try {
        // Check if the meal exists
        const meal = await mealsCollection.findOne({
          _id: new ObjectId(mealId),
        });
        if (!meal)
          return res
            .status(404)
            .send({ success: false, message: "Meal not found" });

        // Prevent duplicate request by email for the same meal
        const existing = await mealRequestsCollection.findOne({
          mealId,
          userId,
          email,
        });
        if (existing)
          return res
            .status(400)
            .send({ success: false, message: "Request already exists" });

        //  Create new request
        const newRequest = {
          mealId,
          mealName,
          userId,
          name,
          email,
          isSubscribed,
          status: "pending", // 👈 default status
          requestedAt: new Date(),
        };

        const result = await mealRequestsCollection.insertOne(newRequest);
        res.send({
          success: true,
          message: "Request submitted",
          requestId: result.insertedId,
        });

        console.log("Successfully Insert The Request");
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({ success: false, message: "Internal Server Error" });
      }
    });

    // ✅ Get All Meal Requests
    // GET /meal-requests?page=1&limit=10
    app.get("/meal-requests", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const skip = (page - 1) * limit;

      try {
        const total = await mealRequestsCollection.countDocuments();
        const requests = await mealRequestsCollection
          .find()
          .sort({ requestTime: -1 }) // optional: newest first
          .skip(skip)
          .limit(limit)
          .toArray();

        res.send({
          success: true,
          data: requests,
          pagination: {
            total,
            page,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (err) {
        res
          .status(500)
          .send({ success: false, message: "Failed to fetch requests" });
      }
    });

    //  ✅ Patch: Amin Approves a request
    app.patch("/meal-requests/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!["delivered", "cancelled"].includes(status)) {
        return res
          .status(400)
          .send({ success: false, message: "Invalid status" });
      }

      try {
        const updateFields = {
          status,
          updatedAt: new Date(),
        };

        if (status === "delivered") {
          updateFields.approvedAt = new Date();
        } else if (status === "cancelled") {
          updateFields.cancelledAt = new Date();
        }

        const result = await mealRequestsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: `Request marked as ${status}` });
        } else {
          res
            .status(404)
            .send({ success: false, message: "Request not found" });
        }
      } catch (err) {
        res
          .status(500)
          .send({ success: false, message: "Error updating request" });
      }
    });

    // ✅ GET: Get My Requests
    // GET /user-meal-requests?email=user@example.com&status=delivered OR cancelled
    app.get("/user-meal-requests", async (req, res) => {
      const { email, status } = req.query;

      if (!email || !status) {
        return res
          .status(400)
          .send({ success: false, message: "Email and status are required." });
      }

      try {
        const requests = await mealRequestsCollection
          .find({ email, status }) // e.g., status = "delivered" or "cancelled"
          .sort({ requestTime: -1 }) // latest first
          .toArray();

        res.send({ success: true, data: requests });
      } catch (err) {
        console.error("Failed to fetch user's requests:", err);
        res.status(500).send({
          success: false,
          message: "Failed to fetch user's meal requests.",
        });
      }
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
