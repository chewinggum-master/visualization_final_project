// Path to the CSV file
const DATA_PATH = "../data/Most Streamed Spotify Songs 2024_selected.csv";

// State variables
let allData = [];
let artists = [];
let selectedArtist = null;
let selectedPlatform = "Spotify Streams";
let artistSortMethod = "streams";
let currentArtistPieTotal = 0;
let currentPlatformTotals = null;
let currentPlatformGrandTotal = 0;
const METRICS = [
    "Spotify Streams",
    "YouTube Views",
    "TikTok Views",
    "Pandora Streams",
    "Soundcloud Streams",
    "Shazam Counts",
];
const pieColor = d3.schemeTableau10;

// Ranks cache: { metric: Map(key -> rank) }
let ranksByMetric = {};
// Totals cache: { metric: number of items with data }
let totalsByMetric = {};

const uniqueKey = d => `${d.Track}__${d.Artist}`;

// Helper to parse numbers with commas
const parseNumber = (str) => {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    return Number(str.replace(/,/g, ""));
};

// Load data
fetch(DATA_PATH)
    .then(response => response.arrayBuffer())
    .then(buffer => {
        const decoder = new TextDecoder("windows-1252");
        const text = decoder.decode(buffer);
        const data = d3.csvParse(text);

    // Pre-process data
    allData = data.filter(d => {
        // Filter out rows with corrupted text (encoding issues)
        if (d.Track && d.Track.includes("ýýý")) return false;
        if (d.Artist && d.Artist.includes("ýýý")) return false;
        return true;
    }).map(d => {
        // Convert numeric columns (only those used)
        const numericCols = METRICS;
        numericCols.forEach(col => {
            if (d[col] && d[col].trim() !== "") {
                d[col] = parseNumber(d[col]);
            } else {
                d[col] = null; // Handle missing values
            }
        });
        return d;
    });

    initArtists();
    precomputeRanks();
    renderArtistList();
    updateSongList();

    // Event Listeners
    d3.select("#artist-sort-select").on("change", function() {
        artistSortMethod = this.value;
        sortArtists();
        renderArtistList();
    });

    d3.select("#platform-select").on("change", function() {
        selectedPlatform = this.value;
        // Re-sort artists if the sort method is "streams" (which means "Selected Metric")
        if (artistSortMethod === "streams") {
            sortArtists();
            renderArtistList();
        } else {
            // Even if not sorting by streams, we need to re-render to update the displayed values
            renderArtistList();
        }
        updateSongList();
    });

    d3.select("#reset-filter").on("click", function() {
        selectedArtist = null;
        renderArtistList(); // Re-render to clear selection styling
        updateSongList();
        // Scroll to top
        d3.select("#artist-list-container").node().scrollTop = 0;
    });

}).catch(error => {
    console.error("Error loading the data:", error);
});

function precomputeRanks() {
    ranksByMetric = {};
    totalsByMetric = {};
    METRICS.forEach(metric => {
        const arr = allData
            .filter(d => d[metric] !== null && d[metric] !== undefined)
            .slice()
            .sort((a, b) => b[metric] - a[metric]);
        const map = new Map();
        arr.forEach((d, i) => {
            const key = uniqueKey(d);
            if (!map.has(key)) {
                map.set(key, i + 1);
            }
        });
        ranksByMetric[metric] = map;
        totalsByMetric[metric] = arr.length;
    });
}

function initArtists() {
    // Group by artist and calculate aggregate metrics for ALL numeric columns
    const numericCols = METRICS;

    const artistMap = d3.rollup(allData, 
        v => {
            const stats = { count: v.length };
            numericCols.forEach(col => {
                stats[col] = d3.sum(v, d => d[col] || 0);
            });
            return stats;
        }, 
        d => d.Artist
    );

    artists = Array.from(artistMap, ([name, value]) => ({
        name,
        ...value
    }));

    // Add "All Artists" option with aggregated stats
    const allStats = {
        name: "All Artists",
        count: allData.length
    };
    numericCols.forEach(col => {
        allStats[col] = d3.sum(allData, d => d[col] || 0);
    });
    
    // Initial sort (will put All Artists at top)
    artists.unshift(allStats);
    sortArtists();
}

function sortArtists() {
    // Separate "All Artists" (always at index 0)
    const allArtists = artists[0];
    const others = artists.slice(1);

    if (artistSortMethod === "streams") {
        // Sort by the currently selected platform/metric
        // For "All Time Rank", lower sum might be considered "better" if we treat it as rank,
        // but usually sum of ranks is meaningless. Let's just sort descending for everything 
        // to be consistent with "traffic/value", unless it's explicitly a Rank column where lower is better.
        // However, the user asked for "traffic", so descending makes sense for 99% of columns.
        // If "All Time Rank" is selected, we'll just sort descending by the sum of ranks (which is weird but consistent).
        
        others.sort((a, b) => {
            const valA = a[selectedPlatform] || 0;
            const valB = b[selectedPlatform] || 0;
            return valB - valA;
        });
    } else if (artistSortMethod === "count") {
        others.sort((a, b) => b.count - a.count);
    } else if (artistSortMethod === "alpha") {
        others.sort((a, b) => a.name.localeCompare(b.name));
    }

    artists = [allArtists, ...others];
}

function renderArtistList() {
    const container = d3.select("#artist-list-container");
    container.html(""); // Clear existing

    const items = container.selectAll(".artist-item")
        .data(artists)
        .enter()
        .append("div")
        .attr("class", "artist-item")
        .classed("selected", d => {
            return d.name === "All Artists" ? selectedArtist === null : d.name === selectedArtist;
        })
        .on("click", (event, d) => {
            if (d.name === "All Artists") {
                selectedArtist = null;
                // Scroll to top
                d3.select("#artist-list-container").node().scrollTop = 0;
            } else {
                // Toggle selection
                if (selectedArtist === d.name) {
                    selectedArtist = null;
                } else {
                    selectedArtist = d.name;
                }
            }
            renderArtistList(); // Re-render to update selection class
            updateSongList();
        });

    items.append("span")
        .text(d => d.name);

    items.append("span")
        .attr("class", "artist-count")
        .text(d => {
            if (d.name === "All Artists") return `${d.count} songs`;
            
            if (artistSortMethod === "streams") {
                // Format: 1.2B, 300M, etc. or just full number? 
                // Let's use full number with commas for precision as requested "show play count"
                const val = d[selectedPlatform];
                if (val === null || val === undefined) return "no data";
                return val.toLocaleString();
            } else {
                return `${d.count} songs`;
            }
        });
}

function updateSongList() {
    // 1. Filter
    let filteredData = allData;
    if (selectedArtist) {
        filteredData = allData.filter(d => d.Artist === selectedArtist);
    }

    // 2. Sort
    // For others (Streams, Views), sort descending (higher is better).
    
    filteredData.sort((a, b) => {
        const valA = a[selectedPlatform];
        const valB = b[selectedPlatform];
        
        // Handle nulls: always put them at the bottom
        if (valA === null && valB === null) return 0;
        if (valA === null) return 1;
        if (valB === null) return -1;

        return valB - valA;
    });

    // 3. Render list
    const container = d3.select("#song-list-container");
    container.html("");

    if (filteredData.length === 0) {
        container.append("div")
            .style("padding", "20px")
            .style("text-align", "center")
            .style("color", "#888")
            .text("No songs found for this criteria.");
        return;
    }

    const rows = container.selectAll(".song-item")
        .data(filteredData)
        .enter()
        .append("div")
        .attr("class", "song-item");

    // Tooltip setup (one-time)
    let tooltip = d3.select("body").select("#tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body")
            .append("div")
            .attr("id", "tooltip")
            .style("opacity", 0);
    }

    // Rank (Index in the current sorted list + 1)
    rows.append("div")
        .attr("class", "song-rank")
        .text((d, i) => i + 1);

    // Info (Title + Artist)
    const infoDiv = rows.append("div")
        .attr("class", "song-info");
    
    infoDiv.append("div")
        .attr("class", "song-title")
        .text(d => d.Track);
    
    infoDiv.append("div")
        .attr("class", "song-artist")
        .text(d => d.Artist)
        .style("cursor", "pointer")
        .on("mouseover", function() { d3.select(this).style("text-decoration", "underline").style("color", "#1890ff"); })
        .on("mouseout", function() { d3.select(this).style("text-decoration", "none").style("color", "#666"); })
        .on("click", (event, d) => {
            event.stopPropagation();
            selectedArtist = d.Artist;
            renderArtistList();
            updateSongList();
            
            // Scroll to the selected artist in the left panel
            setTimeout(() => {
                const selectedEl = d3.select(".artist-item.selected").node();
                if (selectedEl) {
                    selectedEl.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 10);
        });

    // Value
    rows.append("div")
        .attr("class", "song-value")
        .text(d => {
            const val = d[selectedPlatform];
            if (val === null) return "no data";
            // Format number with commas
            return val.toLocaleString();
        });

    // Hover tooltip handlers on the entire row
    rows.on("mouseenter", function(event, d) {
            highlightSlices(d);
            tooltip
                .style("opacity", 1)
                .html(buildTooltipHTML(d));
        })
        .on("mousemove", function(event) {
            const padding = 12;
            const node = tooltip.node();
            const rect = node.getBoundingClientRect();
            let x = event.pageX + padding;
            let y = event.pageY + padding;
            const vw = window.scrollX + window.innerWidth;
            const vh = window.scrollY + window.innerHeight;
            if (x + rect.width > vw) x = event.pageX - padding - rect.width;
            if (y + rect.height > vh) y = event.pageY - padding - rect.height;
            tooltip.style("left", x + "px").style("top", y + "px");
        })
        .on("mouseleave", function() {
            clearHighlights();
            tooltip.style("opacity", 0);
        });

    renderArtistPieChart(filteredData);
    renderPlatformPieChart(filteredData);
}

function buildTooltipHTML(d) {
    const title = `<div class="tt-title">${escapeHtml(d.Track)}</div>`;
    const artist = `<div class="tt-artist">${escapeHtml(d.Artist)}</div>`;

    const head = `<div class="tt-head"><span>平台</span><span>排名</span><span>播放量</span></div>`;

    const rows = METRICS.map(metric => {
        const val = d[metric];
        const rank = ranksByMetric[metric]?.get(uniqueKey(d));
        const total = totalsByMetric[metric];
        const valText = (val === null || val === undefined) ? "no data" : val.toLocaleString();
        const rankText = rank ? `#${rank.toLocaleString()}${total ? '/' + total.toLocaleString() : ''}` : "-";
        return `<div class="tt-row"><span class="tt-metric">${metric}</span><span class="tt-rank">${rankText}</span><span class="tt-value">${valText}</span></div>`;
    }).join("");

    return `<div class="tt-container">${title}${artist}<div class="tt-sep"></div>${head}${rows}</div>`;
}

function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderArtistPieChart(songs) {
    const svg = d3.select("#artist-pie");
    svg.selectAll("*").remove();
    if (!selectedArtist || !songs.length) return;

    const validSongs = songs.filter(d => d[selectedPlatform] && d[selectedPlatform] > 0);
    const total = d3.sum(validSongs, d => d[selectedPlatform]);
    currentArtistPieTotal = total;
    if (!total) return;

    const width = 320;
    const height = 240;
    const topMargin = 28; // Keep title clear
    const innerHeight = height - topMargin;
    const radius = Math.min(width, innerHeight) / 2 - 8;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Title only, no data labels on slices
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .style("font-size", "14px")
        .style("font-weight", "600")
        .text("Artist Song Share");

    const g = svg.append("g").attr("transform", `translate(${width / 2}, ${topMargin + innerHeight / 2})`);
    const pie = d3.pie().value(d => d[selectedPlatform])(validSongs);
    const arc = d3.arc().outerRadius(radius).innerRadius(radius * 0.45).padAngle(0.01).cornerRadius(3);

    g.selectAll("path")
        .data(pie)
        .enter()
        .append("path")
        .attr("d", arc)
        .attr("class", "pie-slice")
        .attr("data-key", d => uniqueKey(d.data))
        .attr("fill", (d, i) => pieColor[i % pieColor.length])
        .attr("stroke", "#fff")
        .attr("stroke-width", 1);

    // Center label placeholder
    svg.append("g")
        .attr("class", "center-label")
        .attr("transform", `translate(${width / 2}, ${topMargin + innerHeight / 2})`)
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .style("font-size", "16px")
        .style("font-weight", "700")
        .style("fill", "#333")
        .text("");
}

function renderPlatformPieChart(songs) {
    const svg = d3.select("#platform-pie");
    svg.selectAll("*").remove();
    if (!selectedArtist || !songs.length) return;

    const platformTotals = METRICS.map(metric => ({
        metric,
        value: d3.sum(songs, d => d[metric] || 0)
    })).filter(d => d.value > 0);

    if (!platformTotals.length) return;

    currentPlatformTotals = platformTotals;
    currentPlatformGrandTotal = d3.sum(platformTotals, d => d.value);

    const width = 320;
    const height = 240;
    const topMargin = 28;
    const bottomMargin = 10;
    const leftMargin = 100;
    const rightMargin = 50;
    const innerWidth = width - leftMargin - rightMargin;
    const innerHeight = height - topMargin - bottomMargin;
    
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Title
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .attr("fill", "#333")
        .style("font-size", "14px")
        .style("font-weight", "600")
        .text("Platform Totals");

    const g = svg.append("g").attr("transform", `translate(${leftMargin}, ${topMargin})`);
    
    const barHeight = innerHeight / platformTotals.length;
    const xScale = d3.scaleLinear()
        .domain([0, currentPlatformGrandTotal])
        .range([0, innerWidth]);

    // Draw bars
    platformTotals.forEach((d, i) => {
        const y = i * barHeight;
        const pct = d.value / currentPlatformGrandTotal;
        const isSelected = d.metric === selectedPlatform;
        
        // Bar
        g.append("rect")
            .attr("x", 0)
            .attr("y", y + barHeight * 0.1)
            .attr("width", xScale(d.value))
            .attr("height", barHeight * 0.8)
            .attr("fill", isSelected ? pieColor[i % pieColor.length] : pieColor[i % pieColor.length])
            .attr("opacity", isSelected ? 1 : 0.6)
            .attr("stroke", isSelected ? "#000" : "#fff")
            .attr("stroke-width", isSelected ? 2 : 1)
            .attr("rx", 3);
        
        // Platform name (left)
        g.append("text")
            .attr("x", -8)
            .attr("y", y + barHeight / 2)
            .attr("text-anchor", "end")
            .attr("dy", "0.35em")
            .style("font-size", "11px")
            .style("font-weight", isSelected ? "700" : "400")
            .style("fill", "#333")
            .text(d.metric.split(" ")[0]);
        
        // Percentage (on bar)
        g.append("text")
            .attr("x", xScale(d.value) + 5)
            .attr("y", y + barHeight / 2)
            .attr("text-anchor", "start")
            .attr("dy", "0.35em")
            .style("font-size", "11px")
            .style("font-weight", "600")
            .style("fill", "#333")
            .text(d3.format(".1%")(pct));
    });
}

function highlightSlices(song) {
    const key = uniqueKey(song);

    const artistSlices = d3.select("#artist-pie").selectAll(".pie-slice");
    if (!artistSlices.empty()) {
        artistSlices
            .classed("highlight", d => uniqueKey(d.data) === key)
            .classed("dim", d => uniqueKey(d.data) !== key);

        if (currentArtistPieTotal > 0) {
            const sliceVal = song[selectedPlatform] || 0;
            const pct = sliceVal / currentArtistPieTotal;
            setCenterLabel("#artist-pie", pct);
        }
    }
}

function clearHighlights() {
    d3.selectAll(".pie-slice").classed("highlight", false).classed("dim", false);
    setCenterLabel("#artist-pie", null);
}

function setCenterLabel(svgSelector, pct) {
    const label = d3.select(svgSelector).select(".center-label text");
    if (label.empty()) return;
    if (pct === null || pct === undefined || isNaN(pct)) {
        label.text("");
    } else {
        label.text(d3.format(".1%")((pct < 0) ? 0 : pct));
    }
}

