import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));
redisClient.on("reconnecting", () => console.log("Redis client reconnecting"));
redisClient.on("connect", () => console.log("Redis client connected"));

async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log("Redis connected successfully");
    }
  } catch (error) {
    console.error("Error connecting to Redis:", error);
  }
}

connectRedis();

export { redisClient };
