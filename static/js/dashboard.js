Chart.register(ChartDataLabels);

const charts = {};
const palette = [
    '#004fa3',
    '#00a6ce',
    '#0c7bb3',
    '#17a398',
    '#ffb000',
    '#3f51b5',
    '#7f8c8d',
    '#1c4587'
];
const selectFilters = ['ubicacion', 'nom_sede', 'categoria_trab'];
const dateFilters = ['fecha_inicio', 'fecha_fin'];
let currentFilters = {
    ubicacion: '',
    nom_sede: '',
    categoria_trab: '',
    fecha_inicio: '',
    fecha_fin: '',
    hostname: ''
};
let hostnameDebounce = null;

document.addEventListener('DOMContentLoaded', () => {
    setupFilters();
    fetchSummary();
});

function setupFilters() {
    selectFilters.forEach((field) => {
        const select = document.getElementById(`filter-${field}`);
        if (!select) return;
        select.addEventListener('change', () => {
            currentFilters[field] = select.value || '';
            fetchSummary();
        });
    });

    dateFilters.forEach((field) => {
        const input = document.querySelector(`[data-date="${field}"]`);
        if (!input) return;
        input.addEventListener('change', () => {
            currentFilters[field] = input.value || '';
            fetchSummary();
        });
    });

    const hostnameInput = document.getElementById('filter-hostname');
    const hostnameBtn = document.getElementById('filter-hostname-btn');
    if (hostnameInput) {
        hostnameInput.addEventListener('input', () => {
            if (hostnameDebounce) clearTimeout(hostnameDebounce);
            hostnameDebounce = setTimeout(() => {
                currentFilters.hostname = hostnameInput.value.trim();
                fetchSummary();
            }, 400);
        });
        hostnameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                currentFilters.hostname = hostnameInput.value.trim();
                fetchSummary();
            }
        });
    }
    if (hostnameBtn && hostnameInput) {
        hostnameBtn.addEventListener('click', () => {
            currentFilters.hostname = hostnameInput.value.trim();
            fetchSummary();
        });
    }

    const resetBtn = document.getElementById('filters-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            selectFilters.forEach((field) => {
                currentFilters[field] = '';
                const select = document.getElementById(`filter-${field}`);
                if (select) select.value = '';
            });
            dateFilters.forEach((field) => {
                currentFilters[field] = '';
                const input = document.querySelector(`[data-date="${field}"]`);
                if (input) input.value = '';
            });
            if (hostnameInput) hostnameInput.value = '';
            currentFilters.hostname = '';
            fetchSummary();
        });
    }
}

async function fetchSummary() {
    try {
        const params = new URLSearchParams();
        [...selectFilters, ...dateFilters, 'hostname'].forEach((field) => {
            const value = currentFilters[field];
            if (value) params.append(field, value);
        });
        const query = params.toString();
        const response = await fetch(query ? `/api/summary?${query}` : '/api/summary');
        if (!response.ok) {
            throw new Error('No se pudo obtener el resumen');
        }
        const data = await response.json();
        renderSelectFilters(data.filters || {});
        renderDateFilters(data.date_filters || {});
        renderHostnameFilter(data.hostname_filter || '');
        renderMetrics(data);
        renderCharts(data);
        renderSchedule(data.schedule, data.schedule_brands || {});
        renderAlerts(data);
        renderTable(data.recent_updates);
    } catch (err) {
        console.error(err);
    }
}

function renderSelectFilters(filters) {
    selectFilters.forEach((field) => {
        const select = document.getElementById(`filter-${field}`);
        if (!select) return;
        const info = filters[field] || { options: [], selected: '' };
        const selectedValue = info.selected ?? currentFilters[field] ?? '';
        const options = ['<option value="">Todas</option>'];
        (info.options || []).forEach((option) => {
            const encoded = escapeHtml(option);
            options.push(`<option value="${encoded}">${encoded}</option>`);
        });
        select.innerHTML = options.join('');
        select.value = selectedValue || '';
        currentFilters[field] = select.value || '';
    });
}

function renderDateFilters(dateFilters) {
    const inputInicio = document.querySelector('[data-date="fecha_inicio"]');
    const inputFin = document.querySelector('[data-date="fecha_fin"]');
    if (inputInicio) {
        const value = (dateFilters?.fecha_inicio) || '';
        inputInicio.value = value;
        currentFilters.fecha_inicio = value;
    }
    if (inputFin) {
        const value = (dateFilters?.fecha_fin) || '';
        inputFin.value = value;
        currentFilters.fecha_fin = value;
    }
}

function renderHostnameFilter(value) {
    const hostnameInput = document.getElementById('filter-hostname');
    if (hostnameInput) {
        hostnameInput.value = value || '';
        currentFilters.hostname = hostnameInput.value.trim();
    }
}

function renderMetrics(data) {
    const total = data.total || 0;
    const buckets = data.status_buckets || {};
    const completed = buckets['Completado'] || 0;
    const progress = buckets['En progreso'] || 0;
    const pending = buckets['Pendiente'] || 0;

    document.getElementById('metric-total').textContent = total;
    document.getElementById('metric-completed').textContent = completed;
    document.getElementById('metric-progress').textContent = progress;
    document.getElementById('metric-pending').textContent = pending;

    const completedPct = total ? ((completed / total) * 100).toFixed(1) : '0.0';
    const progressPct = total ? ((progress / total) * 100).toFixed(1) : '0.0';
    document.getElementById('metric-completed-percentage').textContent = `${completedPct} % del total`;
    document.getElementById('metric-progress-percentage').textContent = `${progressPct} % del total`;

    const latestUpdate = data.recent_updates?.[0]?.last_updated || null;
    const statusLabel = document.getElementById('status-updated-label');
    if (statusLabel) {
        statusLabel.textContent = latestUpdate ? `Ultima actualizacion ${formatDateTime(latestUpdate)}` : 'Sin datos';
    }
}

function renderCharts(data) {
    drawDoughnut('statusChart', data.status_counts || {});
    drawDoughnut('upgradeChart', data.status_buckets || {});
}

function drawDoughnut(canvasId, dataset) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = Object.keys(dataset);
    const values = Object.values(dataset);

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data: values,
                    backgroundColor: labels.map((_, idx) => palette[idx % palette.length]),
                    borderColor: '#ffffff',
                    borderWidth: 2
                },
            ],
        },
        options: {
            responsive: true,
            cutout: '58%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#30425f',
                        padding: 18,
                    },
                },
                datalabels: {
                    color: '#1f2937',
                    font: {
                        weight: '600'
                    },
                    formatter: (value) => (value ? value : '')
                }
            },
        },
    });
}

function renderSchedule(scheduleCounts, scheduleBrands) {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) return;

    if (charts.timeline) {
        charts.timeline.destroy();
    }

    const entries = Object.entries(scheduleCounts || {}).sort((a, b) => {
        return new Date(a[0]) - new Date(b[0]);
    });

    const labels = entries.map(([date]) => formatDateLabel(date));
    const datasets = [];
    const brandOrder = new Set();

    entries.forEach(([date]) => {
        const brands = scheduleBrands[date] || {};
        Object.keys(brands).forEach((brand) => {
            if (brand) brandOrder.add(brand);
        });
    });

    const brandList = Array.from(brandOrder);
    entries.forEach(([date]) => {
        const brands = scheduleBrands[date] || {};
        brandList.forEach((brand, idx) => {
            if (!datasets[idx]) {
                datasets[idx] = {
                    label: brand,
                    data: Array(entries.length).fill(0),
                    backgroundColor: palette[idx % palette.length],
                    stack: 'timeline',
                    datalabels: {
                        display: true,
                        anchor: 'end',
                        align: 'top',
                        color: '#1f2937',
                        formatter: (value) => (value > 0 ? `${brand}: ${value}` : '')
                    }
                };
            }
            datasets[idx].data[entries.indexOf(entries.find((item) => item[0] === date))] = brands[brand] || 0;
        });
    });

    charts.timeline = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets,
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    stacked: true,
                    ticks: { color: '#30425f' },
                    grid: { display: false },
                },
                y: {
                    stacked: true,
                    ticks: { color: '#30425f' },
                    grid: { color: 'rgba(0, 79, 163, 0.08)' },
                    beginAtZero: true,
                },
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#30425f' },
                },
            },
        },
    });
}

function renderAlerts(data) {
    const alertList = document.getElementById('alert-list');
    if (!alertList) return;
    alertList.innerHTML = '';

    const alerts = [];
    const buckets = data.status_buckets || {};
    const statusCounts = data.status_counts || {};

    if (buckets['Pendiente'] > 0) {
        alerts.push(`Hay ${buckets['Pendiente']} usuarios pendientes o con incidencias.`);
    }
    if (statusCounts['INCIDENCIA UPGRADE'] > 0) {
        alerts.push(`Se registran ${statusCounts['INCIDENCIA UPGRADE']} incidencias de upgrade.`);
    }
    if (statusCounts['USER SIN RESPUESTA'] > 0) {
        alerts.push(`${statusCounts['USER SIN RESPUESTA']} usuarios sin respuesta de coordinacion.`);
    }

    if (alerts.length === 0) {
        alertList.innerHTML = '<li class="text-muted">Sin alertas registradas</li>';
        return;
    }

    alerts.slice(0, 3).forEach((alert) => {
        const li = document.createElement('li');
        li.innerHTML = escapeHtml(alert);
        alertList.appendChild(li);
    });
}

function renderTable(rows) {
    const tbody = document.querySelector('#recent-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!rows || rows.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.className = 'text-center text-muted';
        td.textContent = 'Sin registros para mostrar';
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${escapeHtml(row.record_id) || '-'}</td>
            <td>${escapeHtml(row.nombre_completo) || '-'}</td>
            <td>${escapeHtml(row.ubicacion) || '-'}</td>
            <td>${escapeHtml(row.nom_sede) || '-'}</td>
            <td>${escapeHtml(row.categoria_trab) || '-'}</td>
            <td>${escapeHtml(row.estado) || '-'}</td>
            <td>${formatDateLabel(row.fecha_estado) || '-'}</td>
            <td>${escapeHtml(row.notas) || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function formatDateLabel(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
        return parsed.toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return value;
}

function formatDateTime(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
        return parsed.toLocaleString('es-PE', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    return value;
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
