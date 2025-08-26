// Global variables
let currentNode = null;

// Initialize after DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    // Initialize node selector
    loadNodes();

    // Node selection event
    document.getElementById('nodeSelector').addEventListener('change', (e) => {
        const nodeId = e.target.value;
        if (nodeId) {
            currentNode = JSON.parse(nodeId);
            document.getElementById('currentNode').textContent =
                `${currentNode.name} (${currentNode.host}:${currentNode.port})`;

            // Refresh active tab
            refreshActiveTab();
        } else {
            currentNode = null;
            document.getElementById('currentNode').textContent = 'No Node Selected';
            clearAllTabs();
        }
    });

    // Tab switching event
    document.querySelectorAll('.nav-link').forEach(tab => {
        tab.addEventListener('shown.bs.tab', () => {
            if (currentNode) {
                refreshActiveTab();
            }
        });
    });

    // Set log level button
    document.getElementById('setLogLevelBtn').addEventListener('click', setLogLevel);

    // Node management buttons
    document.getElementById('addNodeBtn').addEventListener('click', addNode);
    document.getElementById('updateNodeBtn').addEventListener('click', updateNode);

    // Load node management list
    loadNodeListForManagement();
});

// Load node list
async function loadNodes() {
    try {
        const response = await fetch('/api/nodes');
        const data = await response.json();

        const selector = document.getElementById('nodeSelector');
        selector.innerHTML = '<option value="">-- Select Target Node --</option>';

        data.nodes.forEach(node => {
            const option = document.createElement('option');
            option.value = JSON.stringify(node);
            option.textContent = `${node.name} (${node.host}:${node.port})`;
            selector.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load nodes:', error);
    }
}

// ==== Node Management Functions ====
async function loadNodeListForManagement() {
    try {
        const response = await fetch('/api/nodes');
        const data = await response.json();
        
        const tableBody = document.getElementById('nodeListBody');
        tableBody.innerHTML = '';
        
        data.nodes.forEach(node => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${node.name}</td>
                <td>${node.host}</td>
                <td>${node.port}</td>
                <td>
                    <button class="btn btn-sm btn-warning edit-node me-1" data-name="${node.name}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-node" data-name="${node.name}">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
        
        // Add event listeners to edit/delete buttons
        document.querySelectorAll('.edit-node').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nodeName = e.target.dataset.name;
                const node = data.nodes.find(n => n.name === nodeName);
                if (node) {
                    document.getElementById('nodeName').value = node.name;
                    document.getElementById('nodeHost').value = node.host;
                    document.getElementById('nodePort').value = node.port;
                }
            });
        });
        
        document.querySelectorAll('.delete-node').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nodeName = e.target.dataset.name;
                if (confirm(`Are you sure you want to delete node ${nodeName}?`)) {
                    deleteNode(nodeName);
                }
            });
        });
        
    } catch (error) {
        console.error('Failed to load nodes for management:', error);
        alert('Failed to load nodes: ' + error.message);
    }
}


async function addNode() {
    const name = document.getElementById('nodeName').value.trim();
    const host = document.getElementById('nodeHost').value.trim();
    const port = document.getElementById('nodePort').value.trim();
    
    if (!name || !host || !port) {
        alert('Please fill all fields');
        return;
    }
    
    try {
        const response = await fetch('/api/nodes', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, host, port})
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to add node');
        }
        
        // Refresh UI
        document.getElementById('nodeName').value = '';
        document.getElementById('nodeHost').value = '';
        document.getElementById('nodePort').value = '';
        
        loadNodeListForManagement();
        loadNodes(); // Refresh node selector
        
        alert('Node added successfully');
    } catch (error) {
        console.error('Add node error:', error);
        alert('Failed to add node: ' + error.message);
    }
}


async function updateNode() {
    const name = document.getElementById('nodeName').value.trim();
    const host = document.getElementById('nodeHost').value.trim();
    const port = document.getElementById('nodePort').value.trim();
    
    if (!name || !host || !port) {
        alert('Please fill all fields');
        return;
    }
    
    try {
        const response = await fetch(`/api/nodes/${encodeURIComponent(name)}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, host, port})
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to update node');
        }
        
        // Refresh UI
        loadNodeListForManagement();
        loadNodes(); // Refresh node selector
        
        alert('Node updated successfully');
    } catch (error) {
        console.error('Update node error:', error);
        alert('Failed to update node: ' + error.message);
    }
}


async function deleteNode(nodeName) {
    try {
        const response = await fetch(`/api/nodes/${encodeURIComponent(nodeName)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to delete node');
        }
        
        // Refresh UI
        loadNodeListForManagement();
        loadNodes(); // Refresh node selector
        
        // Clear form if deleting the currently edited node
        if (document.getElementById('nodeName').value === nodeName) {
            document.getElementById('nodeName').value = '';
            document.getElementById('nodeHost').value = '';
            document.getElementById('nodePort').value = '';
        }
        
        alert('Node deleted successfully');
    } catch (error) {
        console.error('Delete node error:', error);
        alert('Failed to delete node: ' + error.message);
    }
}

// Refresh active tab
function refreshActiveTab() {
    const activeTab = document.querySelector('.tab-pane.active');
    if (!activeTab) return;

    switch (activeTab.id) {
        case 'overview':
            loadOverview();
            break;
        case 'metrics':
            loadMetrics();
            break;
        case 'threads':
            loadThreads();
            break;
        case 'loglevel':
            loadLogLevel();
            break;
        case 'node-management':
            loadNodeListForManagement();
            break;
    }
}

// Load overview information
async function loadOverview() {
    if (!currentNode) return;

    const contentDiv = document.getElementById('overviewContent');
    contentDiv.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';

    try {
        // Encode socket path if needed
        // 对端口或socket路径进行双重编码
        const portOrSocket = encodeURIComponent(encodeURIComponent(currentNode.port));
        const response = await fetch(`/proxy/${currentNode.host}/${portOrSocket}/version`);
        const versionInfo = await response.text();

        contentDiv.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Node Information</h5>
                    <p><strong>Name:</strong>${currentNode.name}</p>
                    <p><strong>Host:</strong>${currentNode.host}</p>
                    <p><strong>Port:</strong>${currentNode.port}</p>
                </div>
            </div>
            <div class="card mt-3">
                <div class="card-body">
                    <h5 class="card-title">Version Information</h5>
                    <pre>${versionInfo}</pre>
                </div>
            </div>
        `;
    } catch (error) {
        contentDiv.innerHTML = `<div class="alert alert-danger">Failed to load overview: ${error.message}</div>`;
    }
}

// Load metrics information
async function loadMetrics() {
    if (!currentNode) return;

    const contentDiv = document.getElementById('metricsContent');
    contentDiv.textContent = 'Loading...';

    try {
        // Encode socket path if needed
        const portOrSocket = encodeURIComponent(encodeURIComponent(currentNode.port));
        const response = await fetch(`/proxy/${currentNode.host}/${portOrSocket}/metrics`);
        const metrics = await response.text();
        contentDiv.textContent = metrics;
    } catch (error) {
        contentDiv.textContent = `Failed to load metrics: ${error.message}`;
    }
}

// Load threads information
async function loadThreads() {
    if (!currentNode) return;
    const contentDiv = document.getElementById('threadsContent');
    contentDiv.textContent = 'Loading...';

    try {
        // Encode socket path if needed
        const portOrSocket = encodeURIComponent(encodeURIComponent(currentNode.port));
        const response = await fetch(`/proxy/${currentNode.host}/${portOrSocket}/threads`);
        const threads = await response.text();
        contentDiv.textContent = threads;
    } catch (error) {
        contentDiv.textContent = `Failed to load threads: ${error.message}`;
    }
}

// Load log level
async function loadLogLevel() {
    if (!currentNode) return;

    const contentDiv = document.getElementById('logLevelContent');
    const loggerInput = document.getElementById('loggerInput');

    contentDiv.textContent = 'Loading...';
    loggerInput.value = '';

    try {
        // Encode socket path if needed
        const portOrSocket = encodeURIComponent(encodeURIComponent(currentNode.port));
        const response = await fetch(`/proxy/${currentNode.host}/${portOrSocket}/loglevel`);

        const text = await response.text();

        contentDiv.textContent = text;
    } catch (error) {
        contentDiv.textContent = `Failed to load log levels: ${error.message}`;
    }
}

// Set log level
async function setLogLevel() {
    if (!currentNode) return;

    const loggerInput = document.getElementById('loggerInput');
    const levelSelector = document.getElementById('logLevelSelector');

    const loggerName = loggerInput.value.trim();
    const level = levelSelector.value;

    try {
        let url;
        // Encode socket path if needed
        const portOrSocket = encodeURIComponent(encodeURIComponent(currentNode.port));

        if (!level) {
            // Read log level if no level is selected
            url = `/proxy/${currentNode.host}/${portOrSocket}/loglevel`;
            if (loggerName) {
                url += `?logger_name=${encodeURIComponent(loggerName)}`;
            }
            const response = await fetch(url);
            const text = await response.text();
            alert(text);
        } else {
            // Set log level if level is selected
            if (!loggerName) {
                alert('Please enter a Logger name');
                return;
            }
            url = `/proxy/${currentNode.host}/${portOrSocket}/loglevel?logger_name=${encodeURIComponent(loggerName)}&level=${level}`;
            const response = await fetch(url, { method: 'GET' });

            const text = await response.text();
            alert(text);

            if (response.ok) {
                loadLogLevel();
            }
        }
    } catch (error) {
        alert(`Failed to manage log level: ${error.message}`);
    }
}

// Clear all tab contents
function clearAllTabs() {
    document.getElementById('overviewContent').innerHTML = 'Please select a target node first';
    document.getElementById('metricsContent').textContent = 'Please select a target node first';
    document.getElementById('threadsContent').textContent = 'Please select a target node first';
    document.getElementById('logLevelContent').textContent = 'Please select a target node first';
    document.getElementById('loggerInput').value = '';
}