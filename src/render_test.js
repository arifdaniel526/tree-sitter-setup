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
const treeLayout = d3.tree().nodeSize([60, 220]);
let root;

// generate from JSON file
d3.json("Output/project_ast.json").then(data => {
    let rootData = Array.isArray(data)
        ? { type: "Project folder", children: data }
        : data;

    // root = d3.hierarchy(rootData, d => d.children || (d.ast ? [d.ast] : []));
    // root = d3.hierarchy(rootData, d => getLimitedChildren(d));

    // When loading JSON, preserve full children
    root = d3.hierarchy(rootData, d => {
        // Store original children once
        if (!d._allChildren) {
            // Make sure we always assign an array
            if (d.children) {
                d._allChildren = d.children;
            } else if (d.ast) {
                d._allChildren = [d.ast];
            } else {
                d._allChildren = [];
            }
        }
        return getLimitedChildren(d);
    });

    root.x0 = height / 2;
    root.y0 = 0;

    // collapse initially
    root.children?.forEach(collapseAll);

    update(root);
});

// expand all children node
function expandAll(d) {
    if (d._children) {
        d.children = d._children;
        d._children = null;
    }
}

// collapse all children at start
function collapseAll(d) {
    if (d.children) {
        d._children = d.children;
        d._children.forEach(collapseAll);
        d.children = null;
    }
}

// expand only direct children
function expandChildren(d, batchSize = 10) {
    const parent = d.parent;
    if (!parent) return;

    // Remove the clicked "show more" placeholder
    parent.children = parent.children.filter(c => !c.data.isShowMore);

    // How many are currently shown
    const currentCount = parent.children.length;

    // Add the next batch (just direct children, not recursive)
    const nextBatch = parent.data._allChildren
        .slice(currentCount, currentCount + batchSize)
        .map(c => {

            const childNode = d3.hierarchy(c);
            childNode.x0 = 0;
            childNode.y0 = 0;

            // collapse initially
            if (childNode.children) {
                childNode._children = childNode.children;
                childNode._children.forEach(collapseAll);
                childNode.children = null;
            }

            childNode.parent = parent;   // fix missing parent
            return childNode;
        });

    parent.children = parent.children.concat(nextBatch);

    // If there are still more hidden → add a new "show more" placeholder
    if (currentCount + batchSize < parent.data._allChildren.length) {
        const showMoreNode = d3.hierarchy({
            type: "show more",
            name: "Show more...",
            isShowMore: true
        });
        showMoreNode.parent = parent;
        parent.children.push(showMoreNode);
    }

    update(parent);
}

// set render limit for children
function getLimitedChildren(d, defaultLimit = 50) {
    const allKids = d._allChildren || [];
    if (allKids.length === 0) return [];

    // slice for initial display
    const limited = allKids.slice(0, defaultLimit);

    // add a placeholder if more hidden
    if (allKids.length > defaultLimit) {
        limited.push({
            type: "show more",
            name: "Show more...",
            isShowMore: true
        });
    }

    return limited;
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

    // ensure children are placed consistently below parent
    //  nodes.forEach(d => {
    //     if (d.parent) {
    //         // Offset children relative to parent
    //         if (d.parent.children) {
    //             const idx = d.parent.children.indexOf(d);
    //             d.x = d.parent.x + (idx - (d.parent.children.length - 1) / 2) * 50; // vertical spacing
    //         }
    //         d.y = d.parent.y + 220; // keep growing to the right
    //     }
    // });

    const nodeSel = g.selectAll(".node")
        .data(nodes, d => d.id || (d.id = Math.random()));

    const nodeEnter = nodeSel.enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${source.y0},${source.x0})`)
        .on("click", (event, d) => {
            if (d.data.isShowMore) {
                expandChildren(d);   // only expand next batch of direct children
            } else if (d.children) {
                collapseAll(d);
            } else {
                expandAll(d);
            }
            update(d);
        })
        .on("mousedown", (event, d) => { // middle mouse click node will redirect to the file in VSCode
            if (event.button === 1) {  // middle mouse button
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
                    `<b>Start line:</b> ${d.data.startLine || "?"}, <b>End line:</b> ${d.data.endLine || "?"}<br>` +
                    `<b>Snippet code:</b> For ${snippet.length} of characters<br><pre>${snippet}</pre>`

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

    nodeEnter.append("text")
        .attr("dy", 4)
        .attr("x", d => d.children || d._children ? -15 : 15)
        .style("text-anchor", d => d.children || d._children ? "end" : "start")
        .text(d => {
            if (d.data.type === "Project folder" || d.data.type === "Folder") {
                return d.data.name || d.data.type;
            }
            if (d.data.type === "File") {
                return d.data.name || (d.data.file ? d.data.file.split(/[\\/]/).pop() : "File");
            }
            return d.data.name || d.data.type || "Node";
        });

    const nodeUpdate = nodeEnter.merge(nodeSel)
        .transition()
        .duration(300)
        .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeUpdate.select("circle")
        .style("fill", d => d._children ? "#69b3a2" : (d.data.isShowMore ? "orange" : "#fff"));

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