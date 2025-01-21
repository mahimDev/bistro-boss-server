require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
// const formData = require("form-data");
// const Mailgun = require("mailgun.js");
// const mailgun = new Mailgun(formData);
// const mg = mailgun.client({
//   username: "api",
//   key: process.env.MAILGUN_API_KEY || "key-yourkeyhere",
// });

const nodemailer = require("nodemailer");
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
// send email
const sendEmail = (emailAdress, emailData) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
  });
  transporter.verify((error, success) => {
    if (error) {
      console.log(error);
    } else {
      console.log("transpoter ready to", success);
    }
  });

  // transporter.sendMail()
  const mailBody = {
    from: process.env.NODEMAILER_USER, // sender address
    to: emailAdress, // list of receivers
    subject: "very importent", // Subject line
    text: emailAdress,
    html: `  <div contenteditable="true" className="my-10 w-4/12 text-center mx-auto">
            <p className="text-orange-400 mb-2 ">--- {bbbbbbbbbbbbbbbbbb} ---</p>
            <h1 className="border-y-4 py-3 uppercase  text-2xl">${emailAdress}</h1>
        </div>`, // html body
  };
  transporter.sendMail(mailBody, (error, info) => {
    if (error) {
      console.log(error);
    }
    console.log(info);
    console.log("email send -------->", info.response);
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@practice.hcuo4.mongodb.net/?retryWrites=true&w=majority&appName=practice`;

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
    // await client.connect();

    const userCollection = client.db("bistroBossDb").collection("user");
    const menuCollection = client.db("bistroBossDb").collection("menu");
    const reviewsCollection = client.db("bistroBossDb").collection("reviews ");
    const cartsCollection = client.db("bistroBossDb").collection("carts ");
    const paymentCollection = client.db("bistroBossDb").collection("payment ");
    // middlware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorizetion) {
        return res.status(401).send({ massage: "unauthorized access" });
      }
      const token = req.headers.authorizetion.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (error, decoded) => {
        if (error) {
          return res.status(401).send({ massage: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    // use verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { user_email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_SECRET_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    // admin related api
    app.get(
      "/user/admin/:email",
      verifyToken,

      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decoded.email) {
          return res.status(403).send({ massage: "forbidden access" });
        }
        const query = { user_email: email };
        const user = await userCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user.role === "admin";
        }
        res.send({ admin });
      }
    );
    // stats or analytics related api
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      //  not the best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce(
      //   (total, payment) => total + payment.price,
      //   0
      // );
      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();
      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({
        users,
        menuItems,
        orders,
        revenue,
      });
    });
    // using aggregated pipelines
    app.get("/order-stats", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$menu_ids",
          },
          {
            $lookup: {
              from: "menu",
              localField: "menu_ids",
              foreignField: "_id",
              as: "menuItems",
            },
          },
          {
            $unwind: "$menuItems",
          },
          {
            $group: {
              _id: "$menuItems.category",
              quantity: {
                $sum: 1,
              },
              revenue: {
                $sum: "$menuItems.price",
              },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              totalRevenue: "$revenue",
            },
          },
        ])
        .toArray();
      res.send(result);
    });
    // get menu collection
    app.get("/menu", async (req, res) => {
      const menu = await menuCollection.find().toArray();
      res.send(menu);
    });
    // get one menu item  api
    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      res.send(result);
    });
    // get reviews collection
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });
    // get cart data for user
    app.get("/cart", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });
    // get all users
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers);
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    app.get("/payment/:email", verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });
    // user post related api
    app.post("/user", async (req, res) => {
      const user = req.body;
      // insert email if user does'nt exists
      const query = { user_email: user.user_email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ massage: "user already exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });
    // menu post api
    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const menuInfo = req.body;
      const result = await menuCollection.insertOne(menuInfo);
      res.send(result);
    });
    // post add to cart data
    app.post("/cart", async (req, res) => {
      const data = req.body;
      const result = await cartsCollection.insertOne(data);
      res.send(result);
    });
    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // after payment is successful then data stored api
    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const email = payment.email;
      const data = "email send suucceeded thank you so mutch";
      const paymentResult = await paymentCollection.insertOne(payment);
      // carefully delete each item from the cart
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartsCollection.deleteMany(query);
      sendEmail(email, data);
      // user email about payment confirmaton
      // mg.messages
      //   .create("sandbox-123.mailgun.org", {
      //     from: "Excited User <mailgun@sandbox16e86cffb5de4532a4d2d3541219055c.mailgun.org>",
      //     to: ["md286667@gmail.com"],
      //     subject: "Hello",
      //     text: "Testing some Mailgun awesomness!",
      //     html: "<h1>Testing some Mailgun awesomness!</h1>",
      //   })
      //   .then((msg) => console.log(msg)) // logs response data
      //   .catch((err) => console.error(err)); // logs any error
      res.send({ paymentResult, deleteResult });
    });
    // user can delete cart data
    app.delete("/cart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    });
    // user delete api
    app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });
    // menu items delete api
    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });
    //  create admin api
    app.patch("/user/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    // update for api
    app.patch("/menu/:id", async (req, res) => {
      const menuInfo = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: menuInfo.name,
          price: menuInfo.price,
          category: menuInfo.category,
          recipe: menuInfo.recipe,
          image: menuInfo.image,
        },
      };
      const result = await menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  // console.log("listening on", port);
});
