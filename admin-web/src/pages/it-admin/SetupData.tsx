import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";

export default function SetupData() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const log = (msg: string) => {
    setStatus((prev) => [...prev, msg]);
    console.log(msg);
  };

  const handleSetup = async () => {
    setRunning(true);
    setStatus([]);

    try {
      // ============================================
      // 1. SYSTEM HEALTH
      // ============================================
      log("Creating systemHealth collection...");

      const services = [
        { id: "firestore", name: "Cloud Firestore (database)", status: "Online", avgResponse: "12 ms", order: 1 },
        { id: "auth", name: "Firebase Authentication", status: "Online", avgResponse: "8 ms", order: 2 },
        { id: "storage", name: "Firebase Storage (files)", status: "Online", avgResponse: "24 ms", order: 3 },
        { id: "fcm", name: "FCM Push Notifications", status: "Online", avgResponse: "—", order: 4 },
        { id: "backup", name: "Backup service", status: "Scheduled", avgResponse: "—", order: 5 },
      ];

      for (const s of services) {
        await setDoc(doc(db, "systemHealth", s.id), {
          ...s,
          lastChecked: serverTimestamp(),
        });
        log(`  Added service: ${s.name}`);
      }

      // ============================================
      // 2. PERFORMANCE LOGS
      // ============================================
      log("📁 Creating performanceLogs collection...");

      const perfLogs = [
        { event: "Firestore read latency", value: "12 ms", status: "Normal" },
        { event: "Storage upload — photo evidence", value: "2.1 MB in 1.4s", status: "Normal" },
        { event: "Peak concurrent users", value: "14", status: "Normal" },
        { event: "FCM batch send — 38 notifications", value: "1.2s total", status: "Normal" },
        { event: "Firestore write spike", value: "48 writes/sec", status: "Watch" },
      ];

      for (const p of perfLogs) {
        await addDoc(collection(db, "performanceLogs"), {
          ...p,
          timestamp: serverTimestamp(),
        });
        log(`  Added perf log: ${p.event}`);
      }

      // ============================================
      // 3. ERROR LOGS
      // ============================================
      log("📁 Creating errorLogs collection...");

      const errorLogs = [
        {
          severity: "Warning",
          service: "Firestore",
          description: "Write spike: 48 ops/sec — throttle triggered briefly",
          status: "Resolved",
        },
        {
          severity: "Warning",
          service: "FCM",
          description: "Delivery failure — 3 tokens expired (device uninstall)",
          status: "Resolved",
        },
        {
          severity: "Error",
          service: "Auth",
          description: "Login failure flood — 5 attempts from unknown IP (blocked)",
          status: "Resolved",
        },
      ];

      for (const e of errorLogs) {
        await addDoc(collection(db, "errorLogs"), {
          ...e,
          timestamp: serverTimestamp(),
        });
        log(`  Added error log: ${e.service}`);
      }

      log("🎉 Setup complete!");
      setDone(true);
    } catch (error: any) {
      console.error("Setup error:", error);
      log(`❌ Error: ${error.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F8F9FA",
      padding: "40px 20px",
      fontFamily: "Inter, sans-serif"
    }}>
      <div style={{
        maxWidth: 600,
        margin: "0 auto",
        background: "#FFFFFF",
        borderRadius: 12,
        padding: 32,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)"
      }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24, color: "#111827" }}>
          🛠️ Firestore Setup
        </h1>
        <p style={{ margin: "0 0 24px", color: "#6B7280", fontSize: 14 }}>
          One-time setup to seed test data for System Health page.
          Run this ONCE lang — pagkatapos, puede mo nang i-delete itong route.
        </p>

        <button
          onClick={handleSetup}
          disabled={running || done}
          style={{
            width: "100%",
            padding: "14px 24px",
            background: done ? "#DCFCE7" : "#2563EB",
            color: done ? "#166534" : "#FFFFFF",
            border: 0,
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 600,
            cursor: running || done ? "not-allowed" : "pointer",
            marginBottom: 16,
          }}
        >
          {running ? "Running setup..." : done ? "Setup Complete!" : "Run Setup"}
        </button>

        {status.length > 0 && (
          <div style={{
            background: "#1F2937",
            color: "#10B981",
            padding: 16,
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 12,
            maxHeight: 400,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            lineHeight: 1.6,
          }}>
            {status.join("\n")}
          </div>
        )}

        {done && (
          <button
            onClick={() => navigate("/it-admin/system-health")}
            style={{
              width: "100%",
              padding: "12px 24px",
              background: "#FFFFFF",
              color: "#2563EB",
              border: "1px solid #2563EB",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 16,
            }}
          >
            → Go to System Health Page
          </button>
        )}
      </div>
    </div>
  );
}