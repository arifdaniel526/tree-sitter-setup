import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const width = window.innerWidth;
const height = window.innerHeight;
const jsonFile = "../../Output/processed_depends.json";

const svg = d3
	.select("#tree")
	.append("svg")
	.attr("width", width)
	.attr("height", height)
	.call(
		d3.zoom().on("zoom", (event) => {
			g.attr("transform", event.transform);
		})
	);

const g = svg.append("g").attr("transform", "translate(100,50)");

d3.json(jsonFile).then((data) => {
	// initialise arrows
	// unselected arrow
	svg.append("defs")
		.selectAll("marker")
		.data(["end"])
		.join("marker")
		.attr("id", "arrows")
		.attr("viewBox", "0 -5 10 10")
		.attr("refX", 10)
		.attr("refY", 0)
		.attr("markerWidth", 10)
		.attr("markerHeight", 10)
		.attr("markerUnits", "userSpaceOnUse")
		.attr("orient", "auto")
		.append("svg:path")
		.attr("fill", "#aaa")
		.attr("d", "M 0,-5 L 10,0 L 0,5");

	// selected arrow
	svg.append("defs")
		.selectAll("marker")
		.data([
			{ id: "arrows", color: "#aaa" }, // default
			{ id: "arrows-highlight", color: "#ff6600" }, // highlighted
		])
		.join("marker")
		.attr("id", (d) => d.id)
		.attr("viewBox", "0 -5 10 10")
		.attr("refX", 10)
		.attr("refY", 0)
		.attr("markerWidth", 10)
		.attr("markerHeight", 10)
		.attr("markerUnits", "userSpaceOnUse")
		.attr("orient", "auto")
		.append("svg:path")
		.attr("fill", (d) => d.color)
		.attr("d", "M 0,-5 L 10,0 L 0,5");

	// Initialize the links
	const link = g
		.attr("fill", "none")
		.attr("stroke-width", 1.5)
		.selectAll("path")
		.data(data.links)
		.join("path")
		.style("stroke", "#aaa")
		.attr("marker-end", "url(#arrows)");

	// Initialize the nodes
	const nodeSel = g
		.selectAll(".node")
		.data(data.nodes, (d) => d.id || (d.id = Math.random()));

	const node = nodeSel
		.data(data.nodes)
		.enter()
		.append("g")
		.attr("class", "node")
		.call(d3.drag().on("start", dragStarted).on("drag", dragged));

	// node.append("circle").attr("r", 20);

	node.append("text")
		.attr("dy", 4)
		.style("text-anchor", "middle")
		.text((d, i) => d.name.split("\\").pop().split("/").pop());

	// Now add a rectangle behind the text, sized dynamically
	node.each(function (d) {
		const g = d3.select(this);
		const text = g.select("text");
		const bbox = text.node().getBBox();
		const paddingX = 10;
		const paddingY = 6;

		d.bboxWidth = bbox.width + paddingX;
		d.bboxHeight = bbox.height + paddingY;

		g.insert("rect", "text") // insert before text so it appears behind
			.attr("x", bbox.x - paddingX / 2)
			.attr("y", bbox.y - paddingY / 2)
			.attr("width", bbox.width + paddingX)
			.attr("height", bbox.height + paddingY)
			.attr("rx", 6) // rounded corners
			.attr("ry", 6)
			.attr("fill", "#fff")
			.attr("stroke", "#000");
	});

	// Drag event functions
	function dragStarted(event, d) {
		if (!event.active) simulation.alphaTarget(0.3).restart();
		d.fx = d.x;
		d.fy = d.y;
	}

	function dragged(event, d) {
		d.fx = event.x;
		d.fy = event.y;
	}

	// function dragEnded(event, d) {
	// 	if (!event.active) simulation.alphaTarget(0);
	// 	d.fx = null;
	// 	d.fy = null; // release after drag so simulation can continue
	// }

	let selectedNode = null;

	node.on("click", function (event, d) {
		// If clicking the same node, deselect
		if (selectedNode === d) {
			selectedNode = null;
			node.select("rect").attr("fill", "#fff");
			link.attr("marker-end", "url(#arrows)")
				.style("stroke", "#aaa")
				.style("stroke-width", 1.5)
				.attr("opacity", 1);
			return;
		}

		selectedNode = d;

		// Reset all nodes to default color
		node.select("rect").attr("fill", "#fff");

		// Highlight the clicked node
		d3.select(this).select("rect").attr("fill", "#ffcc00");

		// Highlight outgoing links from this node
		link.attr("marker-end", (l) =>
			l.source === d ? "url(#arrows-highlight)" : "url(#arrows)"
		)
			.style("stroke", (l) => (l.source === d ? "#ff6600" : "#aaa"))
			.style("stroke-width", (l) => (l.source === d ? 3 : 1.5))
			.attr("opacity", (l) => (l.source === d ? 1 : 0.2));
	});

	node.on("dblclick", (event, d) => {
		showCodeSnippet(d);
	});

	// Let's list the force we wanna apply on the network
	const simulation = d3
		.forceSimulation(data.nodes)
		.force(
			"link",
			d3
				.forceLink()
				.id((d) => d.id)
				.links(data.links)
		)
		.force("charge", d3.forceManyBody().strength(-1000))
		.force("x", d3.forceX())
		.force("y", d3.forceY())
		.force("center", d3.forceCenter(width / 2, height / 2))
		.force(
			"collide",
			d3.forceCollide((d) => 65)
		)
		.on("tick", ticked);

	// This function is run at each iteration of the force algorithm, updating the nodes position.
	function ticked() {
		link.attr("d", (d) => {
			const targetRectWidth = d.target.bboxWidth || 40;
			const targetRectHeight = d.target.bboxHeight || 40;

			const dx = d.target.x - d.source.x;
			const dy = d.target.y - d.source.y;

			// half dimensions
			const hw = targetRectWidth / 2;
			const hh = targetRectHeight / 2;

			// Find scale factor to hit rectangle edge
			const scaleX = hw / Math.abs(dx);
			const scaleY = hh / Math.abs(dy);
			const scale = Math.min(scaleX, scaleY);

			const endX = d.target.x - dx * scale;
			const endY = d.target.y - dy * scale;

			return `M${d.source.x},${d.source.y} L${endX},${endY}`;
		});

		node.attr("transform", (d) => `translate(${d.x},${d.y})`);
	}
});

// Redirect to VSCode upon double clicking
function showCodeSnippet(nodeData) {
	if (!nodeData.name) return;
	const filePath = nodeData.name.replace(/\\/g, "/");
	const vscodeUri = `vscode://file/${filePath}:1`;
	window.location.href = vscodeUri;
}
