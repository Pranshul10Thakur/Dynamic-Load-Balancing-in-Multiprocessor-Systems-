
class Process {
    constructor(id, arrivalTime, burstTime, priority = 1) {
        this.id = id;
        this.arrivalTime = arrivalTime;
        this.burstTime = burstTime;
        this.remainingTime = burstTime;
        this.priority = priority;
        this.assignedProcessor = null;
        this.state = 'NEW';
        this.startTime = null;
        this.completionTime = null;
    }
}

class Processor {
    constructor(id) {
        this.id = id;
        this.processes = [];
        this.currentLoad = 0;
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
        if (removed) removed.assignedProcessor = null;
        this.updateLoad();
        return removed;
    }

    updateLoad() {
        this.currentLoad = this.processes.reduce((s, p) => s + (p.remainingTime || 0), 0);
    }

    getLoad() {
        return this.currentLoad;
    }
}

class LoadBalancer {
    constructor(numProcessors = 4, algorithm = 'dynamic') {
        this.processors = Array.from({ length: numProcessors }, (_, i) => new Processor(i));
        this.algorithm = algorithm;
        this.migrationCount = 0;
        this.threshold = 40;
    }

    assignProcess(process) {
        switch (this.algorithm) {
            case 'static': return this.staticAssignment(process);
            case 'dynamic': return this.dynamicAssignment(process);
            case 'adaptive': return this.adaptiveAssignment(process);
            default: return this.dynamicAssignment(process);
        }
    }

    staticAssignment(process) {
        const idx = process.id % this.processors.length;
        this.processors[idx].addProcess(process);
        return idx;
    }

    dynamicAssignment(process) {
        let minLoad = Infinity; let minIndex = 0;
        this.processors.forEach((proc, idx) => {
            const load = proc.getLoad();
            if (load < minLoad) { minLoad = load; minIndex = idx; }
        });
        this.processors[minIndex].addProcess(process);
        return minIndex;
    }

    adaptiveAssignment(process) {
        let best = Infinity; let bestIdx = 0;
        this.processors.forEach((proc, idx) => {
            const score = proc.getLoad() + (proc.processes.length * 5);
            if (score < best) { best = score; bestIdx = idx; }
        });
        this.processors[bestIdx].addProcess(process);
        return bestIdx;
    }

    balance() {
        const loads = this.processors.map(p => p.getLoad());
        const maxLoad = Math.max(...loads);
        const minLoad = Math.min(...loads);
        if (maxLoad - minLoad > this.threshold) {
            const maxIdx = loads.indexOf(maxLoad);
            const minIdx = loads.indexOf(minLoad);
            const overloaded = this.processors[maxIdx];
            const underloaded = this.processors[minIdx];
            if (overloaded.processes.length > 0) {
                let candidate = overloaded.processes[0];
                for (let p of overloaded.processes) {
                    if (p.remainingTime < candidate.remainingTime) candidate = p;
                }
                const removed = overloaded.removeProcess(candidate.id);
                if (removed) {
                    removed.state = 'READY';
                    underloaded.addProcess(removed);
                    this.migrationCount++;
                }
            }
        }
    }

    getMetrics() {
        const loads = this.processors.map(p => p.getLoad());
        const n = this.processors.length || 1;
        const sum = loads.reduce((a, b) => a + b, 0);
        const avg = sum / n;
        const variance = loads.reduce((acc, l) => acc + Math.pow(l - avg, 2), 0) / n;
        return {
            avgLoad: avg.toFixed(2),
            variance: Math.sqrt(variance).toFixed(2),
            migrations: this.migrationCount
        };
    }
}

// Global state
const NUM_PROCESSORS = 4;
let loadBalancer = null;
let processes = [];
let currentTime = -1;
let isRunning = false;
let completedProcesses = [];
let simulationInterval = null;

// Performance history
let performanceHistory = { time: [], avgLoad: [], variance: [], migrations: [] };
let chart = null;

function initializeChart() {
    const canvas = document.getElementById('performanceChart');
    if (!canvas) return;
    chart = { canvas: canvas, ctx: canvas.getContext('2d'), data: performanceHistory };
    drawChart();
}

function drawChart() {
    if (!chart) return;
    const ctx = chart.ctx;
    const canvas = chart.canvas;
    const data = chart.data;

    canvas.width = canvas.offsetWidth;
    canvas.height = 220;

    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (data.time.length === 0) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Start simulation to see performance metrics...', w/2, h/2);
        return;
    }

    const padding = 30;
    const gw = w - padding*2;
    const gh = h - padding*2;
    const maxTime = Math.max(...data.time, 10);
    const maxAvg = Math.max(...data.avgLoad, 10);
    const maxVar = Math.max(...data.variance, 10);

    // axes
    ctx.strokeStyle = '#263247';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, h - padding);
    ctx.lineTo(w - padding, h - padding);
    ctx.stroke();

    // avgLoad line
    if (data.avgLoad.length > 1) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.time.forEach((t, i) => {
            const x = padding + (t / maxTime) * gw;
            const y = h - padding - (parseFloat(data.avgLoad[i]) / maxAvg) * gh;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // variance line
    if (data.variance.length > 1) {
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        data.time.forEach((t, i) => {
            const x = padding + (t / maxTime) * gw;
            const y = h - padding - (parseFloat(data.variance[i]) / maxVar) * gh;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
}

function initializeSystem() {
    const algo = document.getElementById('algorithmSelect').value;
    loadBalancer = new LoadBalancer(NUM_PROCESSORS, algo);

    processes = [];
    for (let i = 0; i < 8; i++) {
        const p = new Process(i, Math.floor(Math.random() * 5), Math.floor(Math.random() * 40) + 20);
        processes.push(p);
    }

    currentTime = -1;
    completedProcesses = [];
    performanceHistory = { time: [], avgLoad: [], variance: [], migrations: [] };

    updateUI();
    initializeChart();
}

function simulateStep() {
    currentTime++;
    processes.forEach(p => {
        if (p.arrivalTime <= currentTime && p.state === 'NEW') {
            loadBalancer.assignProcess(p);
        }
    });

    loadBalancer.processors.forEach(proc => {
        if (proc.processes.length > 0) {
            const running = proc.processes[0];
            running.state = 'RUNNING';
            if (running.startTime === null) running.startTime = currentTime;

            running.remainingTime = Math.max(0, running.remainingTime - 1);
            proc.updateLoad();

            if (running.remainingTime <= 0) {
                running.state = 'TERMINATED';
                running.completionTime = currentTime;
                proc.removeProcess(running.id);
                completedProcesses.push(running);
                proc.updateLoad();
            }
        }
    });

    if (currentTime > 0 && currentTime % 5 === 0) loadBalancer.balance();

    // record metrics
    if (currentTime >= 0) {
        const m = loadBalancer.getMetrics();
        performanceHistory.time.push(currentTime);
        performanceHistory.avgLoad.push(parseFloat(m.avgLoad));
        performanceHistory.variance.push(parseFloat(m.variance));
        performanceHistory.migrations.push(m.migrations);

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
    loadBalancer.processors.forEach((proc, idx) => {
        const rawLoad = proc.getLoad();
        const card = document.createElement('div');
        card.className = 'processor-card';
        card.innerHTML = `
            <div class="processor-title">Processor ${idx}</div>
            <div>Load: <strong>${rawLoad}</strong></div>
            <div>Processes: <strong>${proc.processes.length}</strong></div>
        `;
        grid.appendChild(card);
    });
}

function updateProcessTable() {
    const tbody = document.getElementById('processTable');
    tbody.innerHTML = '';
    processes.filter(p => p.state !== 'TERMINATED').sort((a,b) => a.id - b.id).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>P${p.id}</td>
            <td>${p.arrivalTime}</td>
            <td>${p.burstTime}</td>
            <td>${p.remainingTime}</td>
            <td>${p.assignedProcessor !== null ? 'CPU ' + p.assignedProcessor : '-'}</td>
            <td>${p.state}</td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleSimulation() {
    isRunning = !isRunning;
    const btn = document.getElementById('startPauseBtn');
    if (isRunning) {
        btn.textContent = 'Pause';
        if (simulationInterval) clearInterval(simulationInterval);
        simulationInterval = setInterval(simulateStep, 250);
    } else {
        btn.textContent = 'Start';
        if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; }
    }
}

function addProcess() {
    const maxId = processes.length ? Math.max(...processes.map(p => p.id)) : -1;
    const newId = maxId + 1;
    const arrival = currentTime >= 0 ? currentTime : 0;
    const newP = new Process(newId, arrival, Math.floor(Math.random() * 40) + 20);
    processes.push(newP);
    loadBalancer.assignProcess(newP);
    updateUI();
}

function resetSimulation() {
    if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; }
    isRunning = false;
    document.getElementById('startPauseBtn').textContent = 'Start';
    initializeSystem();
}

window.onload = () => {
    document.getElementById('startPauseBtn').onclick = toggleSimulation;
    document.getElementById('resetBtn').onclick = resetSimulation;
    document.getElementById('addProcessBtn').onclick = addProcess;
    document.getElementById('algorithmSelect').onchange = () => {

        if (loadBalancer) loadBalancer.algorithm = document.getElementById('algorithmSelect').value;
    };
    initializeSystem();
};
