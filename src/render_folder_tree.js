const width = window.innerWidth;
const height = window.innerHeight;
const tooltip = d3.select(".tooltip");

const svg = d3.select("#tree")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .call(d3.zoom().on("zoom", (event) => {
        g.attr("transform", event.transform);
    }));

const g = svg.append("g").attr("transform", "translate(100,50)");
const treeLayout = d3.tree().nodeSize([50, 270]);
let root;

// generate from JSON file
d3.json("Output/project_ast.json").then(data => {
    // if you open viewer.html from another folder, point to "./Output/project_ast.json"
    // example: d3.json("./Output/project_ast.json").then(...)

    let rootData = Array.isArray(data)
        ? { type: "Project folder", children: data }
        : data;

    // children if present, or if a legacy { ast } shape exists, need to treat it as a single child
    root = d3.hierarchy(rootData, d => d.children || (d.ast ? [d.ast] : []));
    root.x0 = 0;
    root.y0 = 0;
    root.children?.forEach(collapseAll);
    update(root);
});

// collapse children node
function collapseAll(d) {
    if (d.children) {
        d._children = d.children;
        d._children.forEach(collapseAll);
        d.children = null;
    }
}

// expand all children node
function expandAll(d) {
    if (d._children) {
        d.children = d._children;
        d._children = null;
    }
    if (d.children) {
        d.children.forEach(expandAll);
    }
}

// expand only direct children
function expandChildren(d) {
    if (d._children) {
        d.children = d._children;
        d._children = null;
    }
}

// extract the code from file
function showCodeSnippet(nodeData) {
    if (!nodeData.data.file) return;
    const filePath = nodeData.data.file.replace(/\\/g, '/');
    const line = nodeData.data.startLine || 1;
    const vscodeUri = `vscode://file/${filePath}:${line}`;
    window.location.href = vscodeUri;
}

function update(source) {
    treeLayout(root);
    const nodes = root.descendants();
    const links = root.links();

    const nodeSel = g.selectAll(".node")
        .data(nodes, d => d.id || (d.id = Math.random()));

    const nodeEnter = nodeSel.enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${source.y0},${source.x0})`)
        .on("click", (event, d) => {
            if (d.children) {
                collapseAll(d); // collapase all nodes
            } else if (d._children) {
                if (d.data.type == "Project folder" || d.data.type == "Folder") {
                    expandChildren(d); // collapse only their children
                } else {
                    expandAll(d); // expand all nodes
                }
            }
            update(d);
        })
        .on("mousedown", (event, d) => { // mouse wheel click node will redirect to the file in VSCode
            if (event.button === 1) {  // middle mouse button, (since button 0 = left, 1 = middle, 2 = right)
                event.preventDefault();
                showCodeSnippet(d);   // open code snippet in VSCode
            }
        })
        .on("mouseover", (event, d) => { // show information about the node
            const snippet = d.data.text
                ? d.data.text.substring(0, 200) + (d.data.text.length > 200 ? "..." : "")
                : "No snippet available";

            tooltip.style("opacity", 1)
                .html(
                    `<b>Type:</b> ${d.data.type || "N/A"}<br>` +
                    `<b>File path:</b> ${d.data.file || "N/A"}<br>` +
                    `<b>Start line:</b> ${d.data.startLine || "?"}, <b>End line:</b> ${d.data.endLine || "?"}<br>`
                    // `<b>Snippet code:</b><br><pre>${snippet}</pre>`
                )
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY + 15) + "px");
        })
        .on("mousemove", (event) => {
            tooltip.style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY + 15) + "px");
        })
        .on("mouseout", () => {
            tooltip.style("opacity", 0);
        });

    nodeEnter.append("circle").attr("r", 10);

    // labeling the parent node name: show folder or file names
    nodeEnter.append("text")
        .attr("dy", 1) // reset baseline
        .attr("x", d => d.children || d._children ? -15 : 15)
        .style("text-anchor", d => d.children || d._children ? "end" : "start")
        .text(d => {
            if (d.data.type === "Project folder" || d.data.type === "Folder") {
                return d.data.name || d.data.type;
            }
            if (d.data.type === "File") {
                return d.data.name || (d.data.file ? d.data.file.split(/[\\/]/).pop() : "File");
            }
            return d.data.type || "Node";
        })

    const nodeUpdate = nodeEnter.merge(nodeSel)
        .transition()
        .duration(300)
        .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeUpdate.select("circle")
        .style("fill", d => d._children ? "#69b3a2" : "#fff");

    nodeSel.exit().transition()
        .duration(300)
        .attr("transform", d => `translate(${source.y},${source.x})`)
        .remove();

    const linkSel = g.selectAll(".link")
        .data(links, d => d.target.id);

    linkSel.enter()
        .insert("path", "g")
        .attr("class", "link")
        .attr("d", d3.linkHorizontal()
            .x(d => source.y0)
            .y(d => source.x0))
        .merge(linkSel)
        .transition()
        .duration(300)
        .attr("d", d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x));

    linkSel.exit().transition()
        .duration(300)
        .attr("d", d3.linkHorizontal()
            .x(d => source.y)
            .y(d => source.x))
        .remove();

    nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}