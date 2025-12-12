import io from 'socket.io-client';
import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Brush } from 'recharts';
import { AlertTriangle, TrendingUp, Activity, ChevronDown, ChevronUp, Table, Maximize2 } from 'lucide-react';

const NelsonQCDashboard = () => {
  const [samples, setSamples] = useState([]);
  const [isTableCollapsed, setIsTableCollapsed] = useState(false);
  const [chartZoom, setChartZoom] = useState({
    weight: { startIndex: 0, endIndex: null },
    hardness: { startIndex: 0, endIndex: null }
  });

  // CONNECT TO BACKEND
  useEffect(() => {
    const socket = io('http://localhost:5000');

    socket.on('connect', () => {
      console.log('Connected to Excel backend');
    });

    socket.on('data-update', (newData) => {
      setSamples(newData);
    });

    socket.on('connect_error', (err) => {
      console.error('Backend not running!', err);
      // Fallback: show your original dummy data
      setSamples([
        { id: 1, weight: 27.2, hardness: 10.1 },
        { id: 2, weight: 26.8, hardness: 9.8 },
        { id: 3, weight: 27.5, hardness: 10.3 },
        { id: 4, weight: 26.5, hardness: 9.5 },
        { id: 5, weight: 27.8, hardness: 10.8 },
      ]);
    });

    return () => socket.disconnect();
  }, []);

  // Define rule descriptions globally
  const ruleDescriptions = {
    1: '1 point beyond 3σ from mean',
    2: '9 consecutive points on same side of mean',
    3: '6 consecutive points increasing or decreasing',
    4: '14 points alternating up and down',
    5: '2 out of 3 points beyond 2σ from mean',
    6: '4 out of 5 points beyond 1σ from mean',
    7: '15 consecutive points within 1σ of mean (low variation)',
    8: '8 consecutive points beyond 1σ on either side of mean'
  };

  const addSample = () => {
    const newId = samples.length + 1;
    setSamples([...samples, { 
      id: newId, 
      weight: 0, 
      hardness: 0 
    }]);
  };

  const updateSample = (id, field, value) => {
    setSamples(samples.map(s => 
      s.id === id ? { ...s, [field]: parseFloat(value) || 0 } : s
    ));
  };

  const deleteSample = (id) => {
    setSamples(samples.filter(s => s.id !== id));
  };

  const stats = useMemo(() => {
    const weights = samples.map(s => s.weight);
    const hardnesses = samples.map(s => s.hardness);
    
    const calcStats = (arr) => {
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const sd = Math.sqrt(arr.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / arr.length);
      const rsd = (sd / avg) * 100;
      return { avg, sd, rsd };
    };

    return {
      weight: calcStats(weights),
      hardness: calcStats(hardnesses)
    };
  }, [samples]);

  const checkNelsonRules = (data, mean, sd) => {
    const violations = new Array(data.length).fill().map(() => []);
    
    // Rule 1: One point beyond 3σ
    data.forEach((val, idx) => {
      if (Math.abs(val - mean) > 3 * sd) {
        violations[idx].push(1);
      }
    });

    // Rule 2: 9 consecutive points on same side of mean
    for (let i = 8; i < data.length; i++) {
      const slice = data.slice(i - 8, i + 1);
      if (slice.every(v => v > mean) || slice.every(v => v < mean)) {
        violations[i].push(2);
      }
    }

    // Rule 3: 6 points steadily increasing/decreasing
    for (let i = 5; i < data.length; i++) {
      const slice = data.slice(i - 5, i + 1);
      const increasing = slice.every((v, j) => j === 0 || v > slice[j - 1]);
      const decreasing = slice.every((v, j) => j === 0 || v < slice[j - 1]);
      if (increasing || decreasing) {
        violations[i].push(3);
      }
    }

    // Rule 4: 14 points alternating up/down
    if (data.length >= 14) {
      for (let i = 13; i < data.length; i++) {
        const slice = data.slice(i - 13, i + 1);
        let alternating = true;
        for (let j = 2; j < slice.length; j++) {
          const currChange = slice[j] - slice[j-1];
          const prevChange = slice[j-1] - slice[j-2];
          if (currChange * prevChange >= 0) {
            alternating = false;
            break;
          }
        }
        if (alternating) {
          violations[i].push(4);
        }
      }
    }

    // Rule 5: 2 out of 3 points beyond 2σ
    for (let i = 2; i < data.length; i++) {
      const slice = data.slice(i - 2, i + 1);
      const beyond2sigma = slice.filter(v => Math.abs(v - mean) > 2 * sd).length;
      if (beyond2sigma >= 2) {
        violations[i].push(5);
      }
    }

    // Rule 6: 4 out of 5 points beyond 1σ
    for (let i = 4; i < data.length; i++) {
      const slice = data.slice(i - 4, i + 1);
      const beyond1sigma = slice.filter(v => Math.abs(v - mean) > sd).length;
      if (beyond1sigma >= 4) {
        violations[i].push(6);
      }
    }

    // Rule 7: 15 points within 1σ (low variation)
    for (let i = 14; i < data.length; i++) {
      const slice = data.slice(i - 14, i + 1);
      if (slice.every(v => Math.abs(v - mean) < sd)) {
        violations[i].push(7);
      }
    }

    // Rule 8: 8 points beyond 1σ on either side
    for (let i = 7; i < data.length; i++) {
      const slice = data.slice(i - 7, i + 1);
      if (slice.every(v => Math.abs(v - mean) > sd)) {
        violations[i].push(8);
      }
    }

    return violations;
  };

  const weightViolations = checkNelsonRules(samples.map(s => s.weight), stats.weight.avg, stats.weight.sd);
  const hardnessViolations = checkNelsonRules(samples.map(s => s.hardness), stats.hardness.avg, stats.hardness.sd);

  // Prepare chart data with violations
  const chartData = samples.map((sample, index) => ({
    ...sample,
    weightViolations: weightViolations[index],
    hardnessViolations: hardnessViolations[index],
    weightHasViolation: weightViolations[index].length > 0,
    hardnessHasViolation: hardnessViolations[index].length > 0,
    weightViolationDescriptions: weightViolations[index].map(rule => ruleDescriptions[rule]),
    hardnessViolationDescriptions: hardnessViolations[index].map(rule => ruleDescriptions[rule]),
  }));

  // Custom tooltip for violations
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const weightViolations = data.weightViolationDescriptions || [];
      const hardnessViolations = data.hardnessViolationDescriptions || [];
      
      return (
        <div className="bg-white p-4 border border-gray-300 shadow-lg rounded-lg">
          <p className="font-bold text-gray-800 mb-2">Sample {label}</p>
          
          {payload.map((entry, index) => (
            <div key={index} className="mb-2">
              <p className="text-sm font-medium" style={{ color: entry.color }}>
                {entry.name}: <span className="font-bold">{entry.value}</span>
              </p>
              
              {entry.dataKey === 'weight' && weightViolations.length > 0 && (
                <div className="mt-1 ml-2">
                  <p className="text-xs font-semibold text-red-600">Statistical Violations:</p>
                  {weightViolations.map((desc, i) => (
                    <p key={i} className="text-xs text-red-600 ml-2">• {desc}</p>
                  ))}
                </div>
              )}
              
              {entry.dataKey === 'hardness' && hardnessViolations.length > 0 && (
                <div className="mt-1 ml-2">
                  <p className="text-xs font-semibold text-red-600">Statistical Violations:</p>
                  {hardnessViolations.map((desc, i) => (
                    <p key={i} className="text-xs text-red-600 ml-2">• {desc}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Toggle to show/hide reference lines
  const [showAllReferenceLines, setShowAllReferenceLines] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800 flex items-center gap-3">
                <Activity className="text-indigo-600" />
                Tablet QC Dashboard
              </h1>
              <p className="text-gray-600 mt-1 text-sm">Statistical Process Control with Nelson Rules</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setIsTableCollapsed(!isTableCollapsed)}
                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold shadow-lg transition"
              >
                <Table size={18} />
                {isTableCollapsed ? 'Show Table' : 'Hide Table'}
                {isTableCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </button>
              <button
                onClick={addSample}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold shadow-lg transition"
              >
                + Add Sample
              </button>
            </div>
          </div>

          {(weightViolations.some(v => v.length > 0) || hardnessViolations.some(v => v.length > 0)) && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
              <div className="flex items-start">
                <AlertTriangle className="text-yellow-600 mr-3 mt-1" />
                <div>
                  <h3 className="font-bold text-yellow-800">Nelson Rules Violations Detected</h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Hover over data points in the charts or table cells to see specific violations
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
              <h3 className="text-lg font-bold text-blue-900 mb-3">Weight Statistics</h3>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-blue-700 text-sm">Average:</span>
                  <span className="font-semibold">{stats.weight.avg.toFixed(2)} g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700 text-sm">Std Dev (σ):</span>
                  <span className="font-semibold">{stats.weight.sd.toFixed(3)} g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-700 text-sm">%RSD:</span>
                  <span className="font-semibold">{stats.weight.rsd.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
              <h3 className="text-lg font-bold text-purple-900 mb-3">Hardness Statistics</h3>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-purple-700 text-sm">Average:</span>
                  <span className="font-semibold">{stats.hardness.avg.toFixed(2)} N</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700 text-sm">Std Dev (σ):</span>
                  <span className="font-semibold">{stats.hardness.sd.toFixed(3)} N</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-700 text-sm">%RSD:</span>
                  <span className="font-semibold">{stats.hardness.rsd.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>

          {!isTableCollapsed && (
            <div className="mb-6 overflow-hidden rounded-lg border border-gray-200">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-3 flex justify-between items-center">
                <h3 className="font-bold">Data Entry Table</h3>
                <span className="text-sm bg-white/20 px-2 py-1 rounded">
                  {samples.length} samples
                </span>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Sample No.</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Weight (g)</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Hardness (N)</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((sample, index) => {
                      const weightPass = sample.weight >= 26 && sample.weight <= 28;
                      const hardnessPass = sample.hardness >= 9 && sample.hardness <= 11;
                      const hasWeightViolation = weightViolations[index] && weightViolations[index].length > 0;
                      const hasHardnessViolation = hardnessViolations[index] && hardnessViolations[index].length > 0;
                      const weightViolationDescs = weightViolations[index] ? weightViolations[index].map(rule => ruleDescriptions[rule]) : [];
                      const hardnessViolationDescs = hardnessViolations[index] ? hardnessViolations[index].map(rule => ruleDescriptions[rule]) : [];

                      return (
                        <tr key={sample.id} className={`border-b hover:bg-gray-50 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}>
                          <td className="px-4 py-3 font-semibold">{sample.id}</td>
                          <td className="px-4 py-3 relative group">
                            <input
                              type="number"
                              step="0.1"
                              value={sample.weight || ''}
                              placeholder="0.0"
                              onChange={(e) => updateSample(sample.id, 'weight', e.target.value)}
                              className={`w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 text-sm ${
                                hasWeightViolation ? 'border-red-500 bg-red-50' : ''
                              }`}
                            />
                            {hasWeightViolation && (
                              <div className="hidden group-hover:block absolute z-10 bg-white border-2 border-red-500 rounded-lg p-3 shadow-xl left-0 top-full mt-1 w-72">
                                <p className="text-xs font-bold text-red-600 mb-1">Weight Violations:</p>
                                {weightViolationDescs.map((desc, i) => (
                                  <p key={i} className="text-xs text-red-600">• {desc}</p>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {sample.weight > 0 && (
                              <div className="relative inline-block">
                                <span 
                                  className={`px-2 py-1 rounded-full text-xs font-semibold ${weightPass ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} ${
                                    hasWeightViolation ? 'ring-1 ring-yellow-400' : ''
                                  }`}
                                >
                                  {weightPass ? 'PASS' : 'FAIL'}
                                  {hasWeightViolation && ' ⚠️'}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 relative group">
                            <input
                              type="number"
                              step="0.1"
                              value={sample.hardness || ''}
                              placeholder="0.0"
                              onChange={(e) => updateSample(sample.id, 'hardness', e.target.value)}
                              className={`w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500 text-sm ${
                                hasHardnessViolation ? 'border-red-500 bg-red-50' : ''
                              }`}
                            />
                            {hasHardnessViolation && (
                              <div className="hidden group-hover:block absolute z-10 bg-white border-2 border-red-500 rounded-lg p-3 shadow-xl left-0 top-full mt-1 w-72">
                                <p className="text-xs font-bold text-red-600 mb-1">Hardness Violations:</p>
                                {hardnessViolationDescs.map((desc, i) => (
                                  <p key={i} className="text-xs text-red-600">• {desc}</p>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {sample.hardness > 0 && (
                              <span 
                                className={`px-2 py-1 rounded-full text-xs font-semibold ${hardnessPass ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} ${
                                  hasHardnessViolation ? 'ring-1 ring-yellow-400' : ''
                                }`}
                              >
                                {hardnessPass ? 'PASS' : 'FAIL'}
                                {hasHardnessViolation && ' ⚠️'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => deleteSample(sample.id)}
                              className="text-red-600 hover:text-red-800 font-semibold text-sm"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Weight Chart */}
            <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <TrendingUp className="text-blue-600" />
                  Weight Control Chart
                </h3>
                <button
                  onClick={() => setShowAllReferenceLines(!showAllReferenceLines)}
                  className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded"
                >
                  {showAllReferenceLines ? 'Hide σ Lines' : 'Show All σ Lines'}
                </button>
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="id" 
                    label={{ value: 'Sample Number', position: 'insideBottom', offset: -5, style: { fontSize: '12px' } }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    label={{ value: 'Weight (g)', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
                    domain={['dataMin - 1', 'dataMax + 1']}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* Essential Reference Lines */}
                  <ReferenceLine y={26} stroke="#16a34a" strokeWidth={2} strokeDasharray="3 3" />
                  <ReferenceLine y={28} stroke="#16a34a" strokeWidth={2} strokeDasharray="3 3" />
                  <ReferenceLine y={stats.weight.avg} stroke="#1d4ed8" strokeWidth={2.5} />
                  <ReferenceLine y={stats.weight.avg + 3 * stats.weight.sd} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 3" />
                  <ReferenceLine y={stats.weight.avg - 3 * stats.weight.sd} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 3" />
                  
                  {/* Optional Reference Lines */}
                  {showAllReferenceLines && (
                    <>
                      <ReferenceLine y={stats.weight.avg + 2 * stats.weight.sd} stroke="#ea580c" strokeWidth={1} strokeDasharray="2 2" />
                      <ReferenceLine y={stats.weight.avg - 2 * stats.weight.sd} stroke="#ea580c" strokeWidth={1} strokeDasharray="2 2" />
                      <ReferenceLine y={stats.weight.avg + stats.weight.sd} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="1 1" />
                      <ReferenceLine y={stats.weight.avg - stats.weight.sd} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="1 1" />
                    </>
                  )}
                  
                  <Line 
                    type="monotone" 
                    dataKey="weight" 
                    stroke="#2563eb" 
                    strokeWidth={2.5} 
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!cx || !cy) return null;
                      return (
                        <circle 
                          cx={cx} 
                          cy={cy} 
                          r={payload.weightHasViolation ? 6 : 4} 
                          fill={payload.weightHasViolation ? "#dc2626" : "#2563eb"} 
                          stroke="#fff" 
                          strokeWidth={payload.weightHasViolation ? 2 : 1}
                        />
                      );
                    }} 
                    name="Weight"
                  />
                  
                  <Brush 
                    dataKey="id" 
                    height={20} 
                    stroke="#2563eb"
                    fill="#eff6ff"
                    travellerWidth={8}
                    startIndex={Math.max(0, chartData.length - 15)}
                    endIndex={chartData.length - 1}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Hardness Chart */}
            <div className="bg-white rounded-lg border-2 border-purple-200 p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <TrendingUp className="text-purple-600" />
                  Hardness Control Chart
                </h3>
                <div className="text-sm text-gray-500">
                  Spec: 9-11 N
                </div>
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="id" 
                    label={{ value: 'Sample Number', position: 'insideBottom', offset: -5, style: { fontSize: '12px' } }}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    label={{ value: 'Hardness (N)', angle: -90, position: 'insideLeft', style: { fontSize: '12px' } }}
                    domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  
                  <ReferenceLine y={9} stroke="#16a34a" strokeWidth={2} strokeDasharray="3 3" />
                  <ReferenceLine y={11} stroke="#16a34a" strokeWidth={2} strokeDasharray="3 3" />
                  <ReferenceLine y={stats.hardness.avg} stroke="#7c3aed" strokeWidth={2.5} />
                  <ReferenceLine y={stats.hardness.avg + 3 * stats.hardness.sd} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 3" />
                  <ReferenceLine y={stats.hardness.avg - 3 * stats.hardness.sd} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 3" />
                  
                  {showAllReferenceLines && (
                    <>
                      <ReferenceLine y={stats.hardness.avg + 2 * stats.hardness.sd} stroke="#ea580c" strokeWidth={1} strokeDasharray="2 2" />
                      <ReferenceLine y={stats.hardness.avg - 2 * stats.hardness.sd} stroke="#ea580c" strokeWidth={1} strokeDasharray="2 2" />
                      <ReferenceLine y={stats.hardness.avg + stats.hardness.sd} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="1 1" />
                      <ReferenceLine y={stats.hardness.avg - stats.hardness.sd} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="1 1" />
                    </>
                  )}
                  
                  <Line 
                    type="monotone" 
                    dataKey="hardness" 
                    stroke="#7c3aed" 
                    strokeWidth={2.5} 
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      if (!cx || !cy) return null;
                      return (
                        <circle 
                          cx={cx} 
                          cy={cy} 
                          r={payload.hardnessHasViolation ? 6 : 4} 
                          fill={payload.hardnessHasViolation ? "#dc2626" : "#7c3aed"} 
                          stroke="#fff" 
                          strokeWidth={payload.hardnessHasViolation ? 2 : 1}
                        />
                      );
                    }} 
                    name="Hardness"
                  />
                  
                  <Brush 
                    dataKey="id" 
                    height={20} 
                    stroke="#7c3aed"
                    fill="#f3e8ff"
                    travellerWidth={8}
                    startIndex={Math.max(0, chartData.length - 15)}
                    endIndex={chartData.length - 1}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-3">Nelson Rules Reference</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {Object.entries(ruleDescriptions).map(([rule, description]) => (
                <div key={rule} className="p-2 bg-white rounded border">
                  <strong className="text-indigo-600">Rule {rule}:</strong> {description}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NelsonQCDashboard;
                            