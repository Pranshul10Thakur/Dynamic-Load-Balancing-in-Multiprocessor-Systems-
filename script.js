// Commit 4 - core simulation classes and basic engine

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

// -------------------------
// Load Balancer Class
// -------------------------
class LoadBalancer {
    constructor(numProcessors = 4, algorithm = 'dynamic') {
        this.processors = Array.from({ length: numProcessors }, (_, i) => new Processor(i));
        this.algorithm = algorithm;
        this.migrationCount = 0;
        this.threshold = 40; // threshold for migration (example)
    }

    assignProcess(process) {
        switch (this.algorithm) {
            case 'static':
                return this.staticAssignment(process);
            case 'dynamic':
                return this.dynamicAssignment(process);
            case 'adaptive':
                return this.adaptiveAssignment(process);
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

    adaptiveAssignment(process) {
        // simple heuristic: load + 5 * number of processes
        let best = Infinity;
        let bestIdx = 0;
        this.processors.forEach((proc, idx) => {
            const score = proc.getLoad() + (proc.processes.length * 5);
            if (score < best) {
                best = score;
                bestIdx = idx;
            }
        });
        this.processors[bestIdx].addProcess(process);
        return bestIdx;
    }

    balance() {
        // simple balancing: if max-min > threshold, migrate a small process
        const loads = this.processors.map(p => p.getLoad());
        const maxLoad = Math.max(...loads);
        const minLoad = Math.min(...loads);

        if (maxLoad - minLoad > this.threshold) {
            const maxIdx = loads.indexOf(maxLoad);
            const minIdx = loads.indexOf(minLoad);
            const overloaded = this.processors[maxIdx];
            const underloaded = this.processors[minIdx];

            if (overloaded.processes.length > 0) {
                // choose smallest remainingTime to migrate
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

// -------------------------
// Global state & initialization
// -------------------------
const NUM_PROCESSORS = 4;
let loadBalancer = null;
let processes = [];
let currentTime = -1;
let isRunning = false;
let completedProcesses = [];
let simulationInterval = null;

function initializeSystem() {
    const algo = document.getElementById('algorithmSelect').value;
    loadBalancer = new LoadBalancer(NUM_PROCESSORS, algo);

    // create some processes as starting load
    processes = [];
    for (let i = 0; i < 6; i++) {
        const p = new Process(i, Math.floor(Math.random() * 3), Math.floor(Math.random() * 30) + 10);
        processes.push(p);
    }

    currentTime = -1;
    completedProcesses = [];
    updateUI();
}

function simulateStep() {
    currentTime++;
    // arrival -> assign
    processes.forEach(p => {
        if (p.arrivalTime <= currentTime && p.state === 'NEW') {
            loadBalancer.assignProcess(p);
        }
    });

    // run processes (first of each processor)
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

    // balance occasionally
    if (currentTime > 0 && currentTime % 5 === 0) {
        loadBalancer.balance();
    }

    updateUI();
}

function toggleSimulation() {
    isRunning = !isRunning;
    const btn = document.getElementById('startPauseBtn');
    if (isRunning) {
        btn.textContent = 'Pause';
        if (simulationInterval) clearInterval(simulationInterval);
        simulationInterval = setInterval(simulateStep, 300);
    } else {
        btn.textContent = 'Start';
        if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; }
    }
}

function addProcess() {
    const maxId = processes.length ? Math.max(...processes.map(p => p.id)) : -1;
    const newId = maxId + 1;
    const arrival = currentTime >= 0 ? currentTime : 0;
    const p = new Process(newId, arrival, Math.floor(Math.random() * 30) + 10);
    processes.push(p);
    loadBalancer.assignProcess(p);
    updateUI();
}

function resetSimulation() {
    if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; }
    isRunning = false;
    document.getElementById('startPauseBtn').textContent = 'Start';
    initializeSystem();
}

// -------------------------
// UI update functions
// -------------------------
function updateProcessorsGrid() {
    const grid = document.getElementById('processorsGrid');
    grid.innerHTML = '';
    loadBalancer.processors.forEach((proc, idx) => {
        const card = document.createElement('div');
        card.className = 'processor-card';
        card.innerHTML = `
            <div class="processor-title">Processor ${idx}</div>
            <div>Load: <strong>${proc.getLoad()}</strong></div>
            <div>Processes: <strong>${proc.processes.length}</strong></div>
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
        .forEach(p => {
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

function updateUI() {
    document.getElementById('timeDisplay').textContent = currentTime >= 0 ? currentTime : 0;
    updateProcessorsGrid();
    updateProcessTable();
}

// -------------------------
// Setup events
// -------------------------
window.onload = () => {
    document.getElementById('startPauseBtn').onclick = toggleSimulation;
    document.getElementById('resetBtn').onclick = resetSimulation;
    document.getElementById('addProcessBtn').onclick = addProcess;
    initializeSystem();
};
