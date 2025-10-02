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

function timelineColor(index) {
    const hue = (index * 37) % 360;
    return `hsl(${hue}, 65%, 55%)`;
}
const selectFilters = ['ubicacion', 'nom_sede', 'categoria_trab'];
const estadoFilters = ['estado'];
const dateFilters = ['fecha_inicio', 'fecha_fin'];
let currentFilters = {
    ubicacion: '',
    nom_sede: '',
    categoria_trab: '',
    estado: '',
    fecha_inicio: '',
    fecha_fin: '',
    nombre: '',
    hostname: ''
};
let nombreDebounce = null;
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

    estadoFilters.forEach((field) => {
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

    const nameInput = document.getElementById('filter-nombre');
    const nameBtn = document.getElementById('filter-nombre-btn');
    if (nameInput) {
        nameInput.addEventListener('input', () => {
            if (nombreDebounce) clearTimeout(nombreDebounce);
            nombreDebounce = setTimeout(() => {
                currentFilters.nombre = nameInput.value.trim();
                fetchSummary();
            }, 400);
        });
        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                currentFilters.nombre = nameInput.value.trim();
                fetchSummary();
            }
        });
    }
    if (nameBtn && nameInput) {
        nameBtn.addEventListener('click', () => {
            currentFilters.nombre = nameInput.value.trim();
            fetchSummary();
        });
    }

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
            estadoFilters.forEach((field) => {
                currentFilters[field] = '';
                const select = document.getElementById(`filter-${field}`);
                if (select) select.value = '';
            });
            dateFilters.forEach((field) => {
                currentFilters[field] = '';
                const input = document.querySelector(`[data-date="${field}"]`);
                if (input) input.value = '';
            });
            if (nameInput) nameInput.value = '';
            currentFilters.nombre = '';
            if (hostnameInput) hostnameInput.value = '';
            currentFilters.hostname = '';
            fetchSummary();
        });
    }
}

async function fetchSummary() {
    try {
        const params = new URLSearchParams();
        [...selectFilters, ...estadoFilters, ...dateFilters, 'nombre', 'hostname'].forEach((field) => {
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
        renderNameFilter(data.name_filter || '');
        renderHostnameFilter(data.hostname_filter || '');
        renderEstadoFilter(data.estado_filter || '', data.estado_options || []);
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

function renderNameFilter(value) {
    const nameInput = document.getElementById('filter-nombre');
    if (nameInput) {
        nameInput.value = value || '';
        currentFilters.nombre = nameInput.value.trim();
    }
}


function renderEstadoFilter(selected, options) {
    const estadoSelect = document.getElementById('filter-estado');
    if (!estadoSelect) return;

    const opts = ['<option value="">Todos</option>'];
    (options || []).forEach((estado) => {
        const safeValue = escapeHtml(estado);
        const isSelected = selected && selected.toUpperCase() === estado.toUpperCase();
        opts.push(`<option value="${safeValue}" ${isSelected ? 'selected' : ''}>${safeValue}</option>`);
    });
    estadoSelect.innerHTML = opts.join('');
    estadoSelect.value = selected || '';
    currentFilters.estado = estadoSelect.value || '';
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


function brandSegmentColor(baseColor, segmentIndex, totalSegments) {
    const match = /hsl\((\d+),\s*([\d.]+)%?,\s*([\d.]+)%?\)/i.exec(baseColor);
    if (!match) return baseColor;
    const hue = Number(match[1]);
    const saturation = Number(match[2]);
    const lightness = Number(match[3]);
    const minLight = 30;
    const maxLight = 75;
    if (totalSegments <= 1) {
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    const step = (maxLight - minLight) / Math.max(totalSegments - 1, 1);
    const value = Math.min(maxLight, Math.max(minLight, minLight + step * segmentIndex));
    return `hsl(${hue}, ${saturation}%, ${value}%)`;
}

function renderSchedule(scheduleCounts, scheduleBrands) {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) return;

    if (charts.timeline) {
        charts.timeline.destroy();
    }

    const entries = Object.entries(scheduleCounts || {}).sort((a, b) => compareIsoDates(a[0], b[0]));
    const labels = entries.map(([date]) => formatDateLabel(date));
    const totals = entries.map(([, value]) => value);
    const rawBrandCounts = entries.map(([date]) => scheduleBrands[date] || {});
    const brandCountsPerDate = rawBrandCounts.map((counts) => {
        const normalized = {};
        Object.entries(counts).forEach(([brand, value]) => {
            const label = (brand && brand.trim()) || 'Sin marca';
            const numericValue = Number(value) || 0;
            if (numericValue > 0) {
                normalized[label] = (normalized[label] || 0) + numericValue;
            }
        });
        return normalized;
    });
    const baseColors = entries.map((_, idx) => timelineColor(idx));

    const brandSet = new Set();
    brandCountsPerDate.forEach((counts) => {
        Object.keys(counts).forEach((label) => {
            brandSet.add(label);
        });
    });
    const brandList = Array.from(brandSet);

    let datasets = [];

    if (brandList.length === 0) {
        datasets = [
            {
                label: 'Total actualizaciones',
                data: totals,
                backgroundColor: baseColors,
                hoverBackgroundColor: baseColors,
                borderRadius: 8,
                borderSkipped: false,
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    color: '#1f2937',
                    formatter: (value) => (value > 0 ? value : '')
                }
            }
        ];
    } else {
        datasets = brandList.map((brandLabel, brandIdx) => {
            const colors = baseColors.map((color) => brandSegmentColor(color, brandIdx, brandList.length));
            return {
                label: brandLabel,
                data: brandCountsPerDate.map((counts) => counts[brandLabel] || 0),
                backgroundColor: colors,
                hoverBackgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 2,
                borderSkipped: false,
                borderRadius: 0,
                stack: 'timeline',
                datalabels: {
                    display: true,
                    anchor: 'center',
                    align: 'center',
                    color: '#ffffff',
                    font: { weight: '600', size: 11 },
                    formatter: (value) => (value > 0 ? value : '')
                }
            };
        });
    }

    const stacked = brandList.length > 0;
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
                    stacked,
                    ticks: { color: '#30425f' },
                    grid: { display: false },
                },
                y: {
                    stacked,
                    beginAtZero: true,
                    ticks: { color: '#30425f' },
                    grid: { color: 'rgba(0, 79, 163, 0.08)' },
                },
            },
            plugins: {
                legend: stacked ? { position: 'bottom', labels: { color: '#30425f' } } : { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.parsed.y;
                            if (!value) return '';
                            if (stacked) {
                                return `${context.dataset.label}: ${value}`;
                            }
                            return `Total: ${value}`;
                        },
                        footer: (context) => {
                            if (!stacked) return '';
                            const idx = context[0]?.dataIndex ?? -1;
                            if (idx < 0) return '';
                            return [`Total: ${totals[idx]}`];
                        },
                    },
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
        td.colSpan = 9;
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
            <td>${escapeHtml(row.hostname) || '-'}</td>
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


function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseIsoDateParts(value) {
    if (!value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function compareIsoDates(a, b) {
    const da = parseIsoDateParts(a);
    const db = parseIsoDateParts(b);
    if (da && db) {
        if (da.year !== db.year) return da.year - db.year;
        if (da.month !== db.month) return da.month - db.month;
        return da.day - db.day;
    }
    return a.localeCompare(b);
}

function formatDateLabel(value) {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
        const [, year, month, day] = match;
        return `${day}/${month}/${year}`;
    }
    return value;
}

function formatDateTime(value) {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value.trim());
    if (match) {
        const [, year, month, day, hour = '00', minute = '00'] = match;
        return `${day}/${month}/${year} ${hour}:${minute}`;
    }
    return value;
}


function convertDateText(value) {
    if (!value) return '';
    const isoRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const euroRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const usRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const isoMatch = isoRegex.exec(value.trim());
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${day}/${month}/${year}`;
    }
    const euroMatch = euroRegex.exec(value.trim());
    if (euroMatch) {
        const [, day, month, year] = euroMatch;
        return `${day}/${month}/${year}`;
    }
    const usMatch = usRegex.exec(value.trim());
    if (usMatch) {
        const [, month, day, year] = usMatch;
        return `${day}/${month}/${year}`;
    }
    return value;
}
