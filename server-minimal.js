// server-minimal.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import moment from "moment";

dotenv.config();

// Conexión a MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("🚀 Conectado a MongoDB Atlas"))
  .catch((err) => console.error("💥 Error de MongoDB:", err));

const app = express();
const PORT = 3001;

// Agrega esto ANTES de tus otros endpoints en server-minimal.js
app.get("/", (req, res) => {
  res.json({
    message: "API del Ciclo Menstrual",
    version: "1.0.0",
    endpoints: {
      cycles: "/api/cycles",
      stats: "/api/stats",
      predictions: "/api/predictions",
    },
  });
});

// Middleware CORS mejorado
app.use((req, res, next) => {
  // Configuración esencial de CORS
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  // Manejo especial para solicitudes OPTIONS
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json()); // Parsear JSON

// Esquema y modelo de ciclo menstrual
const cycleSchema = new mongoose.Schema(
  {
    startDate: { type: Date, required: true },
    duration: { type: Number, required: true, min: 1, max: 15 },
    symptoms: String,
    mood: String,
    flow: {
      type: String,
      enum: ["Ligero", "Moderado", "Fuerte"],
    },
    ovulationDate: Date,
    fertileWindowStart: Date,
    fertileWindowEnd: Date,
    nextPeriodPrediction: Date,
  },
  { timestamps: true }
);

const Cycle = mongoose.model("Cycle", cycleSchema);

// 1. Endpoint para predicciones
app.get("/api/predictions", async (req, res) => {
  try {
    const cycles = await Cycle.find().sort({ startDate: -1 }).limit(6);

    if (cycles.length < 3) {
      return res.json({
        status: "insufficient_data",
        message: "Se necesitan al menos 3 ciclos para predicciones",
      });
    }

    const durations = cycles.map((c) => c.duration);
    const cycleLengths = [];

    for (let i = 1; i < cycles.length; i++) {
      const diff = moment(cycles[i].startDate).diff(
        moment(cycles[i - 1].startDate),
        "days"
      );
      cycleLengths.push(diff);
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const avgCycleLength =
      cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;

    const lastCycle = cycles[0];
    const nextPeriod = moment(lastCycle.startDate).add(avgCycleLength, "days");
    const ovulationDate = moment(nextPeriod).subtract(14, "days");
    const fertileWindowStart = moment(ovulationDate).subtract(3, "days");
    const fertileWindowEnd = moment(ovulationDate).add(2, "days");

    res.json({
      status: "success",
      predictions: {
        nextPeriod: nextPeriod.format("YYYY-MM-DD"),
        ovulationDate: ovulationDate.format("YYYY-MM-DD"),
        fertileWindow: {
          start: fertileWindowStart.format("YYYY-MM-DD"),
          end: fertileWindowEnd.format("YYYY-MM-DD"),
        },
        PMSStart: moment(nextPeriod).subtract(5, "days").format("YYYY-MM-DD"),
      },
      averages: {
        duration: avgDuration,
        cycleLength: avgCycleLength,
      },
    });
  } catch (error) {
    console.error("Error en predicciones:", error);
    res.status(500).json({
      error: "Error en predicciones",
      details: error.message,
    });
  }
});

// 2. Endpoint para obtener todos los ciclos
app.get("/api/cycles", async (req, res) => {
  try {
    const cycles = await Cycle.find().sort({ startDate: -1 });
    res.json(cycles);
  } catch (error) {
    console.error("Error al obtener ciclos:", error);
    res.status(500).json({
      error: "Error al obtener ciclos",
      details: error.message,
    });
  }
});

// 3. Endpoint para estadísticas básicas
app.get("/api/stats", async (req, res) => {
  try {
    const cycles = await Cycle.find().sort({ startDate: 1 });

    if (cycles.length === 0) {
      return res.json({
        averageDuration: null,
        averageCycleLength: null,
      });
    }

    const durations = cycles.map((c) => c.duration);
    const startDates = cycles.map((c) => c.startDate);
    const cycleLengths = [];

    for (let i = 1; i < startDates.length; i++) {
      const diff = Math.abs(
        moment(startDates[i]).diff(moment(startDates[i - 1]), "days")
      );
      cycleLengths.push(diff);
    }

    const avg = (arr) => {
      if (arr.length === 0) return null;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    };

    res.json({
      averageDuration: avg(durations),
      averageCycleLength: avg(cycleLengths),
    });
  } catch (error) {
    console.error("Error en estadísticas:", error);
    res.status(500).json({
      error: "Error al calcular estadísticas",
      details: error.message,
    });
  }
});

// 4. Endpoint para registrar un nuevo ciclo
app.post("/api/cycles", async (req, res) => {
  try {
    const { startDate, duration, symptoms } = req.body;

    // Validación básica
    if (!startDate || !duration) {
      return res.status(400).json({
        error: "Datos incompletos",
        details: "Fecha de inicio y duración son obligatorios",
      });
    }

    const newCycle = new Cycle({
      startDate,
      duration,
      symptoms,
      // Otros campos pueden ir aquí
    });

    const savedCycle = await newCycle.save();

    res.json({
      success: true,
      message: "Ciclo registrado exitosamente",
      data: savedCycle,
    });
  } catch (error) {
    console.error("Error al guardar ciclo:", error);
    res.status(400).json({
      error: "Error al guardar ciclo",
      details: error.message,
    });
  }
});

// 5. Endpoint adicional para diagnóstico
app.get("/api/health", (req, res) => {
  res.json({
    status: "active",
    serverTime: new Date().toISOString(),
    dbStatus:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🌐 Servidor backend escuchando en http://localhost:${PORT}`);
  console.log(`🔒 Configuración CORS activada para todos los orígenes`);
  console.log(`🛡️ Endpoints disponibles:`);
  console.log(`   - GET  /api/predictions`);
  console.log(`   - GET  /api/cycles`);
  console.log(`   - GET  /api/stats`);
  console.log(`   - POST /api/cycles`);
  console.log(`   - GET  /api/health (diagnóstico)`);
});

mongoose.connection.on("connected", () => {
  console.log("🔌 Mongoose conectado a la base:", mongoose.connection.name);
});
