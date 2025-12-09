// -------------------------
// Process Class
// -------------------------
class Process {
    constructor(id, arrivalTime, burstTime, priority = 1) {
        this.id = id;
        this.arrivalTime = arrivalTime;
        this.burstTime = burstTime;
        this.remainingTime = burstTime;
        this.priority = priority;
        this.assignedProcessor = null;
        this.state = 'NEW';
        this.waitingTime = 0;
        this.startTime = null;
        this.completionTime = null;
    }
}

// -------------------------
// Processor Class
// -------------------------
class Processor {
    constructor(id) {
        this.id = id;
        this.processes = [];
        this.currentLoad = 0;
        this.totalExecutionTime = 0;
    }

    addProcess(process) {
        this.processes.push(process);
        process.assignedProcessor = this.id;
        process.state = 'READY';
        this.updateLoad();
    }

    removeProcess(processId) {
        const idx = this.processes.findIndex(p => p.id === processId);
        if (idx === -1) return null;
        const [removed] = this.processes.splice(idx, 1);
        if (removed) {
            removed.assignedProcessor = null;
        }
        this.updateLoad();
        return removed;
    }

    updateLoad() {
        this.currentLoad = this.processes.reduce((sum, p) => sum + (p.remainingTime || 0), 0);
    }

    getLoad() {
        return this.currentLoad;
    }
}

// -------------------------
// Load Balancer Class
// -------------------------
class LoadBalancer {
    constructor(numProcessors, algorithm = 'dynamic') {
        this.processors = Array.from({ length: numProcessors }, (_, i) => new Processor(i));
        this.algorithm = algorithm;
        this.migrationCount = 0;
        this.threshold = 30;
    }

    assignProcess(process, currentTime) {
        switch (this.algorithm) {
            case 'static':
                return this.staticAssignment(process);
            case 'dynamic':
                return this.dynamicAssignment(process);
            case 'adaptive':
                return this.adaptiveAssignment(process, currentTime);
            default:
                return this.dynamicAssignment(process);
        }
    }

    staticAssignment(process) {
        const idx = process.id % this.processors.length;
        this.processors[idx].addProcess(process);
        return idx;
    }

    dynamicAssignment(process) {
        let minLoad = Infinity;
        let minIndex = 0;
        this.processors.forEach((proc, idx) => {
            const load = proc.getLoad();
            if (load < minLoad) {
                minLoad = load;
                minIndex = idx;
            }
        });
        this.processors[minIndex].addProcess(process);
        return minIndex;
    }

    adaptiveAssignment(process, currentTime) {
        let minScore = Infinity;
        let minIndex = 0;
        this.processors.forEach((proc, idx) => {
            const score = proc.getLoad() + (proc.processes.length * 5);
            if (score < minScore) {
                minScore = score;
                minIndex = idx;
            }
        });
        this.processors[minIndex].addProcess(process);
        return minIndex;
    }

    balance(currentTime) {
        if (this.algorithm === 'static') return;

        const loads = this.processors.map(p => p.getLoad());
        const maxLoad = Math.max(...loads);
        const minLoad = Math.min(...loads);
        if (!isFinite(maxLoad) || !isFinite(minLoad)) return;

        if (maxLoad - minLoad > this.threshold) {
            const maxIdx = loads.indexOf(maxLoad);
            const minIdx = loads.indexOf(minLoad);
            const overloadedProc = this.processors[maxIdx];
            const underloadedProc = this.processors[minIdx];

            if (overloadedProc.processes.length > 0) {
                let processToMigrate = overloadedProc.processes[0];
                for (let p of overloadedProc.processes) {
                    if (p.remainingTime < processToMigrate.remainingTime) {
                        processToMigrate = p;
                    }
                }

                const removed = overloadedProc.removeProcess(processToMigrate.id);
                if (removed) {
                    removed.state = 'READY';
                    underloadedProc.addProcess(removed);
                    this.migrationCount++;
                }
            }
        }
    }

    getMetrics() {
        const loads = this.processors.map(p => p.getLoad());
        const n = this.processors.length || 1;
        const sum = loads.reduce((a, b) => a + b, 0);
        const avgLoad = sum / n;
        const variance = loads.reduce((acc, load) => acc + Math.pow(load - avgLoad, 2), 0) / n;
        return {
            avgLoad: avgLoad.toFixed(2),
            variance: Math.sqrt(variance).toFixed(2),
            migrations: this.migrationCount
        };
    }
}

// -------------------------
// Global State
// -------------------------
const NUM_PROCESSORS = 4;
let loadBalancer = null;
let processes = [];
let currentTime = -1;
let isRunning = false;
let completedProcesses = [];
let simulationInterval = null;

// Performance history tracking
let performanceHistory = {
    time: [],
    avgLoad: [],
    variance: [],
    migrations: []
};

let chart = null;

// -------------------------
// Initialize Chart
// -------------------------
function initializeChart() {
    const canvas = document.getElementById('performanceChart');
    const ctx = canvas.getContext('2d');
    
    chart = {
        canvas: canvas,
        ctx: ctx,
        data: performanceHistory
    };
    
    drawChart();
}

// -------------------------
// Draw Chart
// -------------------------
function drawChart() {
    if (!chart) return;
    
    const ctx = chart.ctx;
    const canvas = chart.canvas;
    const data = chart.data;
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 280;
    
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // No data yet
    if (data.time.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Start simulation to see performance metrics...', width / 2, height / 2);
        return;
    }
    
    // Find max values for scaling
    const maxTime = Math.max(...data.time, 10);
    const maxAvgLoad = Math.max(...data.avgLoad, 10);
    const maxVariance = Math.max(...data.variance, 10);
    
    // Draw axes
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Draw grid lines
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (graphHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw Avg Load line
    if (data.avgLoad.length > 1) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.time.forEach((time, i) => {
            const x = padding + (time / maxTime) * graphWidth;
            const y = height - padding - (parseFloat(data.avgLoad[i]) / maxAvgLoad) * graphHeight;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
    
    // Draw Variance line
    if (data.variance.length > 1) {
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.time.forEach((time, i) => {
            const x = padding + (time / maxTime) * graphWidth;
            const y = height - padding - (parseFloat(data.variance[i]) / maxVariance) * graphHeight;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
    
    // Draw labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Time →', width / 2, height - 10);
    
    // Legend
    ctx.textAlign = 'left';
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(width - 150, 20, 15, 15);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Avg Load', width - 130, 32);
    
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(width - 150, 45, 15, 15);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Variance', width - 130, 57);
}

// -------------------------
// Initialize System
// -------------------------
function initializeSystem() {
    const algorithm = document.getElementById('algorithmSelect').value;
    loadBalancer = new LoadBalancer(NUM_PROCESSORS, algorithm);

    processes = [];
    for (let i = 0; i < 8; i++) {
        const proc = new Process(
            i,
            Math.floor(Math.random() * 5),
            Math.floor(Math.random() * 40) + 20,
            Math.floor(Math.random() * 3) + 1
        );
        processes.push(proc);
    }

    currentTime = -1;
    completedProcesses = [];
    
    // Reset performance history
    performanceHistory = {
        time: [],
        avgLoad: [],
        variance: [],
        migrations: []
    };
    
    updateUI();
    if (!chart) initializeChart();
    else drawChart();
}

// -------------------------
// Simulation Step
// -------------------------
function simulateStep() {
    currentTime++;

    processes.forEach(process => {
        if (process.arrivalTime <= currentTime && process.state === 'NEW') {
            loadBalancer.assignProcess(process, currentTime);
        }
    });

    loadBalancer.processors.forEach(processor => {
        if (processor.processes.length > 0) {
            const runningProcess = processor.processes[0];
            runningProcess.state = 'RUNNING';

            if (runningProcess.startTime === null) {
                runningProcess.startTime = currentTime;
            }

            runningProcess.remainingTime = Math.max(0, runningProcess.remainingTime - 1);
            processor.updateLoad();

            if (runningProcess.remainingTime <= 0) {
                runningProcess.state = 'TERMINATED';
                runningProcess.completionTime = currentTime;
                processor.removeProcess(runningProcess.id);
                completedProcesses.push(runningProcess);
                processor.updateLoad();
            }
        }
    });

    if (currentTime > 0 && currentTime % 5 === 0) {
        loadBalancer.balance(currentTime);
    }

    // Record performance metrics every time step
    if (currentTime >= 0) {
        const metrics = loadBalancer.getMetrics();
        performanceHistory.time.push(currentTime);
        performanceHistory.avgLoad.push(parseFloat(metrics.avgLoad));
        performanceHistory.variance.push(parseFloat(metrics.variance));
        performanceHistory.migrations.push(metrics.migrations);
        
        // Keep only last 50 data points for performance
        if (performanceHistory.time.length > 50) {
            performanceHistory.time.shift();
            performanceHistory.avgLoad.shift();
            performanceHistory.variance.shift();
            performanceHistory.migrations.shift();
        }
    }

    updateUI();
    drawChart();
}

// -------------------------
// UI Update Functions
// -------------------------
function updateUI() {
    document.getElementById('timeDisplay').textContent = currentTime >= 0 ? currentTime : 0;

    const metrics = loadBalancer.getMetrics();
    document.getElementById('avgLoad').textContent = metrics.avgLoad;
    document.getElementById('variance').textContent = metrics.variance;
    document.getElementById('migrations').textContent = metrics.migrations;
    document.getElementById('completed').textContent = completedProcesses.length;

    updateProcessorsGrid();
    updateProcessTable();
}

function updateProcessorsGrid() {
    const grid = document.getElementById('processorsGrid');
    grid.innerHTML = '';

    loadBalancer.processors.forEach((processor, idx) => {
        const rawLoad = processor.getLoad();
        const utilization = Math.min((rawLoad / 120) * 100, 100);
        const colorClass = utilization < 40 ? 'green' : utilization < 70 ? 'yellow' : 'red';

        const radius = 70;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (utilization / 100) * circumference;

        const card = document.createElement('div');
        card.className = 'processor-card';
        card.innerHTML = `
            <div class="processor-title">Processor ${idx}</div>
            <div class="circular-progress">
                <svg>
                    <circle class="circle-bg" cx="80" cy="80" r="${radius}"></circle>
                    <circle 
                        class="circle-progress ${colorClass}" 
                        cx="80" 
                        cy="80" 
                        r="${radius}"
                        style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset};"
                    ></circle>
                </svg>
                <div class="progress-text">${utilization.toFixed(0)}%</div>
            </div>
            <div class="processor-stats">
                <div>Load: <span class="stat-highlight">${rawLoad}</span></div>
                <div>Processes: <span class="stat-highlight">${processor.processes.length}</span></div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function updateProcessTable() {
    const tbody = document.getElementById('processTable');
    tbody.innerHTML = '';

    processes
        .filter(p => p.state !== 'TERMINATED')
        .sort((a, b) => a.id - b.id)
        .forEach(process => {
            const row = document.createElement('tr');
            const stateClass = process.state === 'RUNNING'
                ? 'state-running'
                : process.state === 'READY'
                    ? 'state-ready'
                    : 'state-new';

            row.innerHTML = `
                <td>P${process.id}</td>
                <td>${process.arrivalTime}</td>
                <td>${process.burstTime}</td>
                <td>${process.remainingTime}</td>
                <td>${process.assignedProcessor !== null ? 'CPU ' + process.assignedProcessor : '-'}</td>
                <td><span class="state-badge ${stateClass}">${process.state}</span></td>
            `;
            tbody.appendChild(row);
        });
}

// -------------------------
// Control Functions
// -------------------------
function toggleSimulation() {
    isRunning = !isRunning;
    const btn = document.getElementById('startPauseBtn');

    if (isRunning) {
        btn.innerHTML = '<span>⏸</span> Pause';
        btn.className = 'btn-pause';
        if (simulationInterval) clearInterval(simulationInterval);
        simulationInterval = setInterval(simulateStep, 200);
    } else {
        btn.innerHTML = '<span>▶</span> Start';
        btn.className = 'btn-start';
        if (simulationInterval) {
            clearInterval(simulationInterval);
            simulationInterval = null;
        }
    }
}

function resetSimulation() {
    isRunning = false;
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    const btn = document.getElementById('startPauseBtn');
    btn.innerHTML = '<span>▶</span> Start';
    btn.className = 'btn-start';
    initializeSystem();
}

function addProcess() {
    const maxId = processes.length ? Math.max(...processes.map(p => p.id)) : -1;
    const newId = maxId + 1;
    const arrival = currentTime >= 0 ? currentTime : 0;

    const newProcess = new Process(
        newId,
        arrival,
        Math.floor(Math.random() * 40) + 20,
        Math.floor(Math.random() * 3) + 1
    );

    processes.push(newProcess);
    loadBalancer.assignProcess(newProcess, currentTime);
    updateUI();
}

function changeAlgorithm() {
    isRunning = false;
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    const btn = document.getElementById('startPauseBtn');
    btn.innerHTML = '<span>▶</span> Start';
    btn.className = 'btn-start';

    const algo = document.getElementById('algorithmSelect').value;
    const newLB = new LoadBalancer(NUM_PROCESSORS, algo);

    const active = processes.filter(p => p.state !== 'TERMINATED');

    active.forEach(p => {
        p.assignedProcessor = null;
        if (p.state === 'RUNNING') p.state = 'READY';
    });

    active.sort((a, b) => a.id - b.id).forEach(p => {
        newLB.assignProcess(p, currentTime);
    });

    loadBalancer = newLB;
    updateUI();
}

// -------------------------
// Initialize on Load
// -------------------------

// -------------------------
// Download Report Function
// -------------------------
function downloadReport() {
    const metrics = loadBalancer.getMetrics();
    const timestamp = new Date().toLocaleString();
    
    // Create CSV content
    let csvContent = "DYNAMIC LOAD BALANCING SIMULATOR - SIMULATION REPORT\n";
    csvContent += "=" .repeat(60) + "\n\n";
    
    // Simulation Summary
    csvContent += "SIMULATION SUMMARY\n";
    csvContent += "-".repeat(60) + "\n";
    csvContent += `Report Generated: ${timestamp}\n`;
    csvContent += `Algorithm Used: ${loadBalancer.algorithm.toUpperCase()}\n`;
    csvContent += `Total Simulation Time: ${currentTime}\n`;
    csvContent += `Number of Processors: ${NUM_PROCESSORS}\n`;
    csvContent += `Total Processes: ${processes.length}\n`;
    csvContent += `Completed Processes: ${completedProcesses.length}\n`;
    csvContent += `Active Processes: ${processes.length - completedProcesses.length}\n\n`;
    
    // Performance Metrics
    csvContent += "PERFORMANCE METRICS\n";
    csvContent += "-".repeat(60) + "\n";
    csvContent += `Average Load: ${metrics.avgLoad}\n`;
    csvContent += `Load Standard Deviation: ${metrics.variance}\n`;
    csvContent += `Total Migrations: ${metrics.migrations}\n`;
    csvContent += `Migration Rate: ${(metrics.migrations / Math.max(currentTime, 1)).toFixed(2)} per time unit\n\n`;
    
    // Processor Utilization
    csvContent += "PROCESSOR UTILIZATION\n";
    csvContent += "-".repeat(60) + "\n";
    csvContent += "Processor ID,Current Load,Active Processes,Utilization %\n";
    loadBalancer.processors.forEach((proc, idx) => {
        const utilization = Math.min((proc.getLoad() / 120) * 100, 100);
        csvContent += `${idx},${proc.getLoad()},${proc.processes.length},${utilization.toFixed(2)}%\n`;
    });
    csvContent += "\n";
    
    // Completed Processes Details
    csvContent += "COMPLETED PROCESSES\n";
    csvContent += "-".repeat(60) + "\n";
    csvContent += "Process ID,Arrival Time,Burst Time,Start Time,Completion Time,Turnaround Time,Waiting Time,Assigned Processor\n";
    completedProcesses.forEach(proc => {
        const turnaroundTime = proc.completionTime - proc.arrivalTime;
        const waitingTime = turnaroundTime - proc.burstTime;
        csvContent += `P${proc.id},${proc.arrivalTime},${proc.burstTime},${proc.startTime},${proc.completionTime},${turnaroundTime},${waitingTime},CPU ${proc.assignedProcessor}\n`;
    });
    csvContent += "\n";
    
    // Active Processes
    if (processes.length - completedProcesses.length > 0) {
        csvContent += "ACTIVE PROCESSES\n";
        csvContent += "-".repeat(60) + "\n";
        csvContent += "Process ID,Arrival Time,Burst Time,Remaining Time,State,Assigned Processor\n";
        processes.filter(p => p.state !== 'TERMINATED').forEach(proc => {
            csvContent += `P${proc.id},${proc.arrivalTime},${proc.burstTime},${proc.remainingTime},${proc.state},${proc.assignedProcessor !== null ? 'CPU ' + proc.assignedProcessor : 'Not Assigned'}\n`;
        });
        csvContent += "\n";
    }
    
    // Performance History
    if (performanceHistory.time.length > 0) {
        csvContent += "PERFORMANCE HISTORY (Last 50 time units)\n";
        csvContent += "-".repeat(60) + "\n";
        csvContent += "Time,Average Load,Variance,Migrations\n";
        performanceHistory.time.forEach((time, i) => {
            csvContent += `${time},${performanceHistory.avgLoad[i]},${performanceHistory.variance[i]},${performanceHistory.migrations[i]}\n`;
        });
        csvContent += "\n";
    }
    
    // Algorithm Comparison Notes
    csvContent += "ALGORITHM NOTES\n";
    csvContent += "-".repeat(60) + "\n";
    if (loadBalancer.algorithm === 'static') {
        csvContent += "Static (Round Robin): Processes are assigned in a circular order.\n";
        csvContent += "No dynamic load balancing or process migration occurs.\n";
    } else if (loadBalancer.algorithm === 'dynamic') {
        csvContent += "Dynamic (Min Load): Processes are assigned to the processor with minimum load.\n";
        csvContent += "Automatic process migration occurs when load imbalance exceeds threshold.\n";
    } else if (loadBalancer.algorithm === 'adaptive') {
        csvContent += "Adaptive (Smart): Assignment considers both current load and process count.\n";
        csvContent += "Intelligent process migration based on predicted future load.\n";
    }
    csvContent += "\n";
    
    // Footer
    csvContent += "=" .repeat(60) + "\n";
    csvContent += "End of Report\n";
    csvContent += "Generated by Dynamic Load Balancing Simulator\n";
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const filename = `LoadBalancing_Report_${loadBalancer.algorithm}_${Date.now()}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
window.onload = () => {
    initializeSystem();
    updateUI();
};
