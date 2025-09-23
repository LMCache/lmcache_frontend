// Global variables
let currentNode = null;
let currentProxy = null;
let proxyNodes = {};
// Initialize after DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    // Initialize proxy selector
    loadProxies();

    // Proxy selection event
    document.getElementById('proxySelector').addEventListener('change', (e) => {
        const proxyName = e.target.value;
        if (proxyName) {
            currentProxy = proxyNodes[proxyName];
            loadTargetNodes(proxyName);
        } else {
            currentProxy = null;
            document.getElementById('targetSelector').disabled = true;
            document.getElementById('targetSelector').innerHTML = '<option value="">-- Select Target --</option>';
        }
    });

    // Target selection event
    document.getElementById('targetSelector').addEventListener('change', (e) => {
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

    // Config management buttons
    document.getElementById('getConfigBtn').addEventListener('click', getConfig);
    document.getElementById('setConfigBtn').addEventListener('click', setConfig);

    // Refresh page button
    document.getElementById('refreshPageBtn').addEventListener('click', refreshCurrentPage);

    // Node management buttons
    document.getElementById('addNodeBtn').addEventListener('click', addNode);
    document.getElementById('updateNodeBtn').addEventListener('click', updateNode);

    // Refresh nodes button
    document.getElementById('refreshNodesBtn').addEventListener('click', refreshNodes);

    // Refresh current page function
    function refreshCurrentPage() {
        if (currentNode) {
            refreshActiveTab();
        } else {
            alert('Please select a target node first');
        }
    }

    // Load node management list
    document.getElementById('node-management-tab').addEventListener('shown.bs.tab', () => {
        loadNodeListForManagement();
    });
});

// Load proxy list
async function loadProxies() {
    try {
        const response = await fetch('/api/proxies');
        const data = await response.json();

        const selector = document.getElementById('proxySelector');
        selector.innerHTML = '<option value="">-- Select Proxy --</option>';

        proxyNodes = {};

        data.proxies.forEach(proxy => {
            const option = document.createElement('option');
            option.value = proxy.name;
            option.textContent = `${proxy.name} (${proxy.host}:${proxy.port})`;
            selector.appendChild(option);

            proxyNodes[proxy.name] = proxy;
        });
    } catch (error) {
        console.error('Failed to load proxies:', error);
    }
}

// Load target nodes for selected proxy
async function loadTargetNodes(proxyName) {
    try {
        const response = await fetch(`/api/proxies/${proxyName}/nodes`);
        const data = await response.json();

        const selector = document.getElementById('targetSelector');
        selector.innerHTML = '<option value="">-- Select Target --</option>';
        selector.disabled = false;

        data.nodes.forEach(node => {
            const option = document.createElement('option');
            option.value = JSON.stringify(node);
            option.textContent = `${node.name} (${node.host}:${node.port})`;
            selector.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load target nodes:', error);
    }
}

// Refresh child nodes of proxy
async function refreshProxyNodes(proxyName) {
    try {
        const response = await fetch(`/api/proxies/${proxyName}/refresh`);
        const data = await response.json();
        if (data.status === "success") {
            return data.nodes;
        }
        return [];
    } catch (error) {
        console.error('Failed to refresh proxy nodes:', error);
        return [];
    }
}

// Load node list
async function loadNodes() {}

// Refresh nodes for current proxy
async function refreshNodes() {
    if (!currentProxy) return;
    await loadTargetNodes(currentProxy.name);
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
                <td>${node.is_proxy ? 'Yes' : 'No'}</td>
                <td>${node.proxy_id || '-'}</td>
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
                    
                    // Auto-set proxy fields
                    document.getElementById('isProxyCheck').checked = node.is_proxy || false;
                    document.getElementById('proxyIdInput').value = node.proxy_id || '';
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
    const isProxy = document.getElementById('isProxyCheck').checked;
    const proxyId = document.getElementById('proxyIdInput').value.trim();
    
    if (!name || !host || !port) {
        alert('Please fill all fields');
        return;
    }
    
    try {
        const response = await fetch('/api/nodes', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name, 
                host, 
                port,
                is_proxy: isProxy,
                proxy_id: proxyId || null
            })
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
    const isProxy = document.getElementById('isProxyCheck').checked;
    const proxyId = document.getElementById('proxyIdInput').value.trim();
    
    if (!name || !host || !port) {
        alert('Please fill all fields');
        return;
    }
    
    try {
        const response = await fetch(`/api/nodes/${encodeURIComponent(name)}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name, 
                host, 
                port,
                is_proxy: isProxy,
                proxy_id: proxyId || null
            })
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
        case 'config':
            loadConfig();
            break;
        case 'meta':
            loadMeta();
            break;
        case 'inference':
            loadInference();
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
        const response = await fetch(transformPath('version'));
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
        const response = await fetch(transformPath('metrics'));
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
        const response = await fetch(transformPath('threads'));
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
        const response = await fetch(transformPath('loglevel'));

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
            url = transformPath('loglevel');
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
            url = transformPath('loglevel');
            url += `?logger_name=${encodeURIComponent(loggerName)}&level=${level}`;
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

// Load configuration
async function loadConfig() {
    if (!currentNode) return;

    const contentDiv = document.getElementById('configContent');
    const configKeyInput = document.getElementById('configKeyInput');
    const configValueInput = document.getElementById('configValueInput');

    contentDiv.textContent = 'Loading...';
    configKeyInput.value = '';
    configValueInput.value = '';

    try {
        const response = await fetch(transformPath('conf'));
        const text = await response.text();
        contentDiv.textContent = text;
    } catch (error) {
        contentDiv.textContent = `Failed to load configuration: ${error.message}`;
    }
}

// Get configuration
async function getConfig() {
    if (!currentNode) return;

    const configKeyInput = document.getElementById('configKeyInput');
    const configKey = configKeyInput.value.trim();

    try {
        let url = transformPath('conf');
        if (configKey) {
            url += `?key=${encodeURIComponent(configKey)}`;
        }
        const response = await fetch(url);
        const text = await response.text();
        alert(text);
    } catch (error) {
        alert(`Failed to get configuration: ${error.message}`);
    }
}

// Set configuration
async function setConfig() {
    if (!currentNode) return;

    const configKeyInput = document.getElementById('configKeyInput');
    const configValueInput = document.getElementById('configValueInput');

    const configKey = configKeyInput.value.trim();
    const configValue = configValueInput.value.trim();

    if (!configKey) {
        alert('Please enter a configuration key');
        return;
    }

    if (!configValue) {
        alert('Please enter a configuration value');
        return;
    }

    try {
        const url = transformPath('conf') + `?key=${encodeURIComponent(configKey)}&value=${encodeURIComponent(configValue)}`;
        const response = await fetch(url, { method: 'GET' });
        const text = await response.text();
        alert(text);

        if (response.ok) {
            loadConfig();
        }
    } catch (error) {
        alert(`Failed to set configuration: ${error.message}`);
    }
}

// Load meta information
async function loadMeta() {
    if (!currentNode) return;

    const contentDiv = document.getElementById('metaContent');
    contentDiv.textContent = 'Loading...';

    try {
        const response = await fetch(transformPath('meta'));
        const text = await response.text();
        contentDiv.textContent = text;
    } catch (error) {
        contentDiv.textContent = `Failed to load meta information: ${error.message}`;
    }
}

// Load inference information
async function loadInference() {
    if (!currentNode) return;

    const contentDiv = document.getElementById('inferenceContent');
    contentDiv.textContent = 'Loading...';

    try {
        const response = await fetch(transformPath('inference_info'));
        const text = await response.text();
        contentDiv.textContent = text;
    } catch (error) {
        contentDiv.textContent = `Failed to load inference information: ${error.message}`;
    }
}

// Clear all tab contents
function clearAllTabs() {
    document.getElementById('overviewContent').innerHTML = 'Please select a target node first';
    document.getElementById('metricsContent').textContent = 'Please select a target node first';
    document.getElementById('threadsContent').textContent = 'Please select a target node first';
    document.getElementById('logLevelContent').textContent = 'Please select a target node first';
    document.getElementById('configContent').textContent = 'Please select a target node first';
    document.getElementById('metaContent').textContent = 'Please select a target node first';
    document.getElementById('inferenceContent').textContent = 'Please select a target node first';
    document.getElementById('loggerInput').value = '';
    document.getElementById('configKeyInput').value = '';
    document.getElementById('configValueInput').value = '';
}

function transformPath(path) {
    if (!currentNode) return path;
    
    if (currentNode.proxy_id && proxyNodes[currentNode.proxy_id]) {
        const proxyNode = proxyNodes[currentNode.proxy_id];
        return `/proxy2/${proxyNode.name}/proxy2/${currentNode.name}/${path}`;
    }
    return `/proxy2/${currentNode.name}/${path}`;
}
