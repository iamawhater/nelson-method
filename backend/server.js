const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const XLSX = require('xlsx');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');

console.log('Starting QC Dashboard Backend...');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // React app URL
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Configuration
const EXCEL_FILE_PATH = path.join(__dirname, 'qc_data.xlsx');
let currentData = [];

console.log('Excel file path:', EXCEL_FILE_PATH);

// Function to read Excel file
function readExcelFile() {
  try {
    if (!fs.existsSync(EXCEL_FILE_PATH)) {
      console.log('⚠ Excel file not found, using dummy data');
      return [
        { id: 1, weight: 27.2, hardness: 10.1 },
        { id: 2, weight: 26.8, hardness: 9.8 },
        { id: 3, weight: 27.5, hardness: 10.3 },
        { id: 4, weight: 26.5, hardness: 9.5 },
        { id: 5, weight: 27.8, hardness: 10.8 },
      ];
    }

    const workbook = XLSX.readFile(EXCEL_FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // Transform data to match expected format
    const transformedData = jsonData.map((row, index) => ({
      id: row.id || index + 1,
      weight: parseFloat(row.weight || row.Weight || 0),
      hardness: parseFloat(row.hardness || row.Hardness || 0)
    }));
    
    console.log(`✓ Loaded ${transformedData.length} samples from Excel`);
    return transformedData;
  } catch (error) {
    console.error('❌ Error reading Excel file:', error.message);
    // Return dummy data if file doesn't exist
    return [
      { id: 1, weight: 27.2, hardness: 10.1 },
      { id: 2, weight: 26.8, hardness: 9.8 },
      { id: 3, weight: 27.5, hardness: 10.3 },
      { id: 4, weight: 26.5, hardness: 9.5 },
      { id: 5, weight: 27.8, hardness: 10.8 },
    ];
  }
}

// Function to write Excel file
function writeExcelFile(data) {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'QC Data');
    XLSX.writeFile(workbook, EXCEL_FILE_PATH);
    console.log('✓ Excel file updated');
  } catch (error) {
    console.error('❌ Error writing Excel file:', error.message);
  }
}

// Watch Excel file for changes (only if file exists)
let watcher = null;
if (fs.existsSync(EXCEL_FILE_PATH)) {
  watcher = chokidar.watch(EXCEL_FILE_PATH, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  watcher.on('change', (filePath) => {
    console.log(`📊 Excel file changed: ${filePath}`);
    const newData = readExcelFile();
    currentData = newData;
    io.emit('data-update', newData);
  });

  console.log('👀 Watching Excel file for changes');
} else {
  console.log('⚠ Excel file watcher disabled (file not found)');
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('✓ Client connected:', socket.id);
  
  // Send current data to newly connected client
  socket.emit('data-update', currentData);
  
  // Handle manual data updates from client
  socket.on('update-data', (newData) => {
    console.log('📝 Received data update from client');
    currentData = newData;
    writeExcelFile(newData);
    // Broadcast to all other clients
    socket.broadcast.emit('data-update', newData);
  });
  
  socket.on('disconnect', () => {
    console.log('✗ Client disconnected:', socket.id);
  });
});

// REST API endpoints (optional)
app.get('/api/data', (req, res) => {
  console.log('GET /api/data');
  res.json(currentData);
});

app.post('/api/data', (req, res) => {
  console.log('POST /api/data');
  currentData = req.body;
  writeExcelFile(currentData);
  io.emit('data-update', currentData);
  res.json({ success: true, data: currentData });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    samples: currentData.length,
    excelFileExists: fs.existsSync(EXCEL_FILE_PATH)
  });
});

// Initialize data on startup
console.log('📖 Reading initial data...');
currentData = readExcelFile();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   QC Dashboard Backend Server          ║
║   Running on http://localhost:${PORT}   ║
╚════════════════════════════════════════╝

📁 Excel file: ${EXCEL_FILE_PATH}
📊 Loaded samples: ${currentData.length}
🌐 CORS enabled for: http://localhost:3000
✅ Ready for connections!

Test endpoints:
  - http://localhost:${PORT}/health
  - http://localhost:${PORT}/api/data
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  if (watcher) {
    watcher.close();
  }
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});