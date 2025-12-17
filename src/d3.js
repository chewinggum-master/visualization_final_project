// Path to the CSV file
const DATA_PATH = "../data/Most Streamed Spotify Songs 2024_selected.csv";

// State variables
let allData = [];
let artists = [];
let selectedArtists = []; // Changed to array for multi-select
let selectedPlatform = "Spotify";
let artistSortMethod = "streams";
let artistSearchQuery = "";
let songSearchQuery = "";
let currentArtistPieTotal = 0;
let currentPlatformTotals = null;
let currentPlatformGrandTotal = 0;
const METRICS = [
    "Spotify",
    "YouTube",
    "TikTok",
    "Pandora",
    "Soundcloud",
    "Shazam",
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

    d3.select("#artist-search").on("input", function() {
        artistSearchQuery = this.value.toLowerCase();
        renderArtistList();
    });

    d3.select("#song-search").on("input", function() {
        songSearchQuery = this.value.toLowerCase();
        updateSongList();
    });

    d3.select("#platform-select").on("change", function() {
        selectedPlatform = this.value;
        // Re-sort artists if the sort method is "streams" (which means "Selected Metric")
        // No labels on the pie slices per request
        updateSongList();
    });

    d3.select("#reset-filter").on("click", function() {
        selectedArtists = [];
        artistSearchQuery = "";
        songSearchQuery = "";
        d3.select("#artist-search").property("value", "");
        d3.select("#song-search").property("value", "");
        renderArtistList();
        updateSongList();
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

    // Filter by search query
    const filtered = artists.filter(d => {
        if (d.name === "All Artists") return true;
        return d.name.toLowerCase().includes(artistSearchQuery);
    });

    const items = container.selectAll(".artist-item")
        .data(filtered)
        .enter()
        .append("div")
        .attr("class", "artist-item")
        .classed("selected", d => {
            return d.name === "All Artists" ? selectedArtists.length === 0 : selectedArtists.includes(d.name);
        })
        .on("click", (event, d) => {
            if (d.name === "All Artists") {
                selectedArtists = [];
                d3.select("#artist-list-container").node().scrollTop = 0;
            } else {
                // Multi-select with Ctrl/Cmd, toggle otherwise
                if (event.ctrlKey || event.metaKey) {
                    const index = selectedArtists.indexOf(d.name);
                    if (index > -1) {
                        selectedArtists.splice(index, 1);
                    } else {
                        if (selectedArtists.length < 5) { // Max 5 artists
                            selectedArtists.push(d.name);
                        }
                    }
                } else {
                    // Single click: toggle or replace
                    if (selectedArtists.length === 1 && selectedArtists[0] === d.name) {
                        selectedArtists = [];
                    } else {
                        selectedArtists = [d.name];
                    }
                }
            }
            renderArtistList();
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
    // 1. Determine Base Set (Context for Ranking)
    let baseData;
    if (selectedArtists.length > 0) {
        baseData = allData.filter(d => selectedArtists.includes(d.Artist));
    } else {
        baseData = allData.slice();
    }

    // 2. Sort Base Set to establish ranking
    baseData.sort((a, b) => {
        const valA = a[selectedPlatform];
        const valB = b[selectedPlatform];
        
        // Handle nulls: always put them at the bottom
        if (valA === null && valB === null) return 0;
        if (valA === null) return 1;
        if (valB === null) return -1;

        return valB - valA;
    });

    // 3. Assign Ranks
    const rankMap = new Map();
    baseData.forEach((d, i) => {
        rankMap.set(uniqueKey(d), i + 1);
    });

    // 4. Filter by search query for Display
    let displayData = baseData;
    if (songSearchQuery) {
        displayData = displayData.filter(d => {
            const track = (d.Track || "").toLowerCase();
            return track.includes(songSearchQuery);
        });
    }

    // 5. Render list
    const container = d3.select("#song-list-container");
    container.html("");

    if (displayData.length === 0) {
        container.append("div")
            .style("padding", "20px")
            .style("text-align", "center")
            .style("color", "#888")
            .text("No songs found for this criteria.");
        return;
    }

    const rows = container.selectAll(".song-item")
        .data(displayData)
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

    // Rank (Use the pre-calculated rank)
    rows.append("div")
        .attr("class", "song-rank")
        .text(d => rankMap.get(uniqueKey(d)));

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
            selectedArtists = [d.Artist];
            songSearchQuery = "";
            d3.select("#song-search").property("value", "");
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

    renderArtistPieChart(displayData);
    renderPlatformPieChart(displayData);
    updateArtistLegend();
}

function buildTooltipHTML(d) {
    const title = `<div class="tt-title">${escapeHtml(d.Track)}</div>`;
    const artist = `<div class="tt-artist">${escapeHtml(d.Artist)}</div>`;

    const head = `<div class="tt-head"><span>platform</span><span>rank</span><span>streams</span></div>`;

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
    if (selectedArtists.length === 0 || !songs.length) return;

    const width = 320;
    const height = 240;
    const topMargin = 28;
    const innerHeight = height - topMargin;
    const radius = Math.min(width, innerHeight) / 2 - 8;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (selectedArtists.length === 1) {
        // Single artist: show song distribution
        const validSongs = songs.filter(d => d[selectedPlatform] && d[selectedPlatform] > 0);
        const total = d3.sum(validSongs, d => d[selectedPlatform]);
        currentArtistPieTotal = total;
        if (!total) return;

        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 18)
            .attr("text-anchor", "middle")
            .attr("fill", "#333")
            .style("font-size", "14px")
            .style("font-weight", "600")
            .text("Song Contribution to Total Platform Streams");

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
    } else {
        // Multi-artist: show artist comparison
        const artistTotals = selectedArtists.map(artist => {
            const artistSongs = songs.filter(d => d.Artist === artist);
            return {
                artist,
                value: d3.sum(artistSongs, d => d[selectedPlatform] || 0)
            };
        }).filter(d => d.value > 0);

        if (!artistTotals.length) return;

        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 18)
            .attr("text-anchor", "middle")
            .attr("fill", "#333")
            .style("font-size", "14px")
            .style("font-weight", "600")
            .text("Artist Comparison by Platform Streams");

        const g = svg.append("g").attr("transform", `translate(${width / 2}, ${topMargin + innerHeight / 2})`);
        const pie = d3.pie().value(d => d.value)(artistTotals);
        const arc = d3.arc().outerRadius(radius).innerRadius(radius * 0.45).padAngle(0.01).cornerRadius(3);

        g.selectAll("path")
            .data(pie)
            .enter()
            .append("path")
            .attr("d", arc)
            .attr("class", "pie-slice")
            .attr("fill", (d, i) => pieColor[i % pieColor.length])
            .attr("stroke", "#fff")
            .attr("stroke-width", 2);

        // No slice labels for multi-artist pie (titles only)
    }
}

function renderPlatformPieChart(songs) {
    const svg = d3.select("#platform-pie");
    svg.selectAll("*").remove();
    if (selectedArtists.length === 0 || !songs.length) return;

    const width = 320;
    const height = 240;
    const topMargin = 28;
    const bottomMargin = 10;
    
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (selectedArtists.length === 1) {
        // Single artist: platform distribution bar chart
        const platformTotals = METRICS.map(metric => ({
            metric,
            value: d3.sum(songs, d => d[metric] || 0)
        })).filter(d => d.value > 0);

        if (!platformTotals.length) return;

        currentPlatformTotals = platformTotals;
        currentPlatformGrandTotal = d3.sum(platformTotals, d => d.value);

        const leftMargin = 100;
        const rightMargin = 50;
        const innerWidth = width - leftMargin - rightMargin;
        const innerHeight = height - topMargin - bottomMargin;

        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 18)
            .attr("text-anchor", "middle")
            .attr("fill", "#333")
            .style("font-size", "14px")
            .style("font-weight", "600")
            .text("Distribution by Platform");

        const g = svg.append("g").attr("transform", `translate(${leftMargin}, ${topMargin})`);
        const barHeight = innerHeight / platformTotals.length;
        const xScale = d3.scaleLinear()
            .domain([0, currentPlatformGrandTotal])
            .range([0, innerWidth]);

        platformTotals.forEach((d, i) => {
            const y = i * barHeight;
            const pct = d.value / currentPlatformGrandTotal;
            const isSelected = d.metric === selectedPlatform;
            
            g.append("rect")
                .attr("x", 0)
                .attr("y", y + barHeight * 0.1)
                .attr("width", xScale(d.value))
                .attr("height", barHeight * 0.8)
                .attr("fill", pieColor[i % pieColor.length])
                .attr("opacity", isSelected ? 1 : 0.6)
                .attr("stroke", isSelected ? "#000" : "#fff")
                .attr("stroke-width", isSelected ? 2 : 1)
                .attr("rx", 3);
            
            g.append("text")
                .attr("x", -8)
                .attr("y", y + barHeight / 2)
                .attr("text-anchor", "end")
                .attr("dy", "0.35em")
                .style("font-size", "11px")
                .style("font-weight", isSelected ? "700" : "400")
                .style("fill", "#333")
                .text(d.metric.split(" ")[0]);
            
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
    } else {
        // Multi-artist: grouped bar chart comparison
        svg.append("text")
            .attr("x", width / 2)
            .attr("y", 18)
            .attr("text-anchor", "middle")
            .attr("fill", "#333")
            .style("font-size", "14px")
            .style("font-weight", "600")
            .text("Platform Comparison by Artist");

        const leftMargin = 80;
        const rightMargin = 20;
        const innerWidth = width - leftMargin - rightMargin;
        const innerHeight = height - topMargin - bottomMargin;

        const g = svg.append("g").attr("transform", `translate(${leftMargin}, ${topMargin})`);
        
        const artistData = selectedArtists.map(artist => {
            const artistSongs = songs.filter(d => d.Artist === artist);
            const totals = {};
            METRICS.forEach(metric => {
                totals[metric] = d3.sum(artistSongs, d => d[metric] || 0);
            });
            return { artist, totals };
        });

        const barHeight = innerHeight / METRICS.length;
        const barGroupHeight = barHeight * 0.8;
        const barWidth = barGroupHeight / selectedArtists.length;

        const maxVal = d3.max(artistData, d => d3.max(METRICS, m => d.totals[m]));
        const xScale = d3.scaleLinear().domain([0, maxVal]).range([0, innerWidth]);

        METRICS.forEach((metric, mi) => {
            const y = mi * barHeight;
            const isSelectedMetric = metric === selectedPlatform;

            // Row highlight background for the selected platform
            if (isSelectedMetric) {
                g.append("rect")
                    .attr("x", 0)
                    .attr("y", y + barHeight * 0.05)
                    .attr("width", innerWidth)
                    .attr("height", barGroupHeight)
                    .attr("fill", "#f5f7ff")
                    .lower();
            }

            // Metric label
            g.append("text")
                .attr("x", -8)
                .attr("y", y + barHeight / 2)
                .attr("text-anchor", "end")
                .attr("dy", "0.35em")
                .style("font-size", "11px")
                .style("font-weight", isSelectedMetric ? "700" : "500")
                .style("fill", isSelectedMetric ? "#000" : "#333")
                .text(metric.split(" ")[0]);

            // Bars for each artist
            artistData.forEach((ad, ai) => {
                const val = ad.totals[metric];
                g.append("rect")
                    .attr("x", 0)
                    .attr("y", y + barHeight * 0.1 + ai * barWidth)
                    .attr("width", xScale(val))
                    .attr("height", barWidth * 0.9)
                    .attr("fill", pieColor[ai % pieColor.length])
                    .attr("opacity", isSelectedMetric ? 1 : 0.6)
                    .attr("stroke", isSelectedMetric ? "#000" : null)
                    .attr("stroke-width", isSelectedMetric ? 1.5 : null)
                    .attr("rx", 2);
            });
        });

        // Legend removed here; using bottom-right legend (#artist-legend)
    }
}

function highlightSlices(song) {
    const artistSlices = d3.select("#artist-pie").selectAll(".pie-slice");
    if (artistSlices.empty()) return;

    if (selectedArtists.length === 1) {
        // Single-artist: highlight by song slice key and update center percent
        const key = uniqueKey(song);
        artistSlices
            .classed("highlight", d => uniqueKey(d.data) === key)
            .classed("dim", d => uniqueKey(d.data) !== key);

        if (currentArtistPieTotal > 0) {
            const sliceVal = song[selectedPlatform] || 0;
            const pct = sliceVal / currentArtistPieTotal;
            setCenterLabel("#artist-pie", pct);
        }
    } else {
        // Multi-artist: highlight by matching the song's artist to the slice's artist
        const artistName = song.Artist;
        artistSlices
            .classed("highlight", d => d?.data?.artist === artistName)
            .classed("dim", d => d?.data?.artist !== artistName);
        // No center label update in multi-artist mode
    }
}

function clearHighlights() {
    d3.selectAll(".pie-slice").classed("highlight", false).classed("dim", false);
    setCenterLabel("#artist-pie", null);
}

    function updateArtistLegend() {
        const panel = d3.select('.charts-panel');
        let legend = panel.select('#artist-legend');
        if (legend.empty()) return; // container exists in HTML

        if (selectedArtists.length > 1) {
            legend.classed('visible', true);
            const items = legend.selectAll('.legend-item')
                .data(selectedArtists, d => d);

            items.exit().remove();

            const enter = items.enter()
                .append('div')
                .attr('class', 'legend-item');

            enter.append('span')
                .attr('class', 'legend-swatch');
            enter.append('span')
                .attr('class', 'legend-label');

            const merged = enter.merge(items);
            merged.select('.legend-swatch')
                .style('background-color', (d, i) => pieColor[i % pieColor.length]);
            merged.select('.legend-label')
                .text(d => d);
        } else {
            legend.classed('visible', false).selectAll('*').remove();
        }
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

