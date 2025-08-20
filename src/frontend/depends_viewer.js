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

// disable double click zoom
const zoom = d3
	.zoom()
	.scaleExtent([0.1, 10])
	.on("zoom", (event) => {
		svg.select("g").attr("transform", event.transform);
	});

// Disable double-click zoom:
svg.call(zoom).on("dblclick.zoom", null);

d3.json(jsonFile).then((data) => {
	const boxGroup = g.append("g").attr("class", "boxes");
	const linkGroup = g.append("g").attr("class", "links");
	const nodeGroup = g.append("g").attr("class", "nodes");
	const measureLayer = svg.append("g").attr("visibility", "hidden");

	//
	// --- 1. Group files into packages ---
	//
	const packageMap = new Map();
	data.nodes.forEach((n) => {
		const pkg = n.package || "root";
		if (!packageMap.has(pkg)) {
			packageMap.set(pkg, {
				id: "pkg:" + pkg,
				name: pkg,
				type: "package",
				files: [],
			});
		}
		packageMap.get(pkg).files.push({ ...n, type: "file" });
	});

	// initial nodes = packages only
	let nodes = Array.from(packageMap.values());

	//
	// --- 2. Package-level links ---
	//
	let links = data.links.map((l) => {
		const sPkg = data.nodes.find((n) => n.id === l.source).package;
		const tPkg = data.nodes.find((n) => n.id === l.target).package;
		return {
			source: packageMap.get(sPkg),
			target: packageMap.get(tPkg),
		};
	});

	// deduplicate package links
	links = Array.from(
		new Set(links.map((l) => l.source.id + "->" + l.target.id))
	).map((key) => {
		const [s, t] = key.split("->");
		return {
			source: nodes.find((n) => n.id === s),
			target: nodes.find((n) => n.id === t),
		};
	});

	//
	// --- 3. Arrow markers ---
	//
	svg.append("defs")
		.selectAll("marker")
		.data([
			{ id: "arrows", color: "#aaa" },
			{ id: "arrows-out", color: "#ff6600" },
			{ id: "arrows-in", color: "#0066cc" },
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

	//
	// --- 4. Draw nodes + links ---
	//
	let link = linkGroup
		.selectAll("path")
		.data(links)
		.join("path")
		.style("stroke", "#aaa")
		.attr("marker-end", "url(#arrows)");

	let node = nodeGroup
		.selectAll(".node")
		.data(nodes, (d) => d.id)
		.join((enter) => {
			const n = enter
				.append("g")
				.attr("class", "node")
				.call(
					d3
						.drag()
						.on("start", dragStarted)
						.on("drag", dragged)
						.on("end", dragEnded)
				);

			n.append("text")
				.attr("dy", 4)
				.style("text-anchor", "middle")
				.text((d) =>
					d.type === "package"
						? d.name
						: d.name.split("\\").pop().split("/").pop()
				);

			n.each(function (d) {
				const g = d3.select(this);
				const text = g.select("text");
				const bbox = text.node().getBBox();
				const paddingX = 10;
				const paddingY = 6;

				d.bboxWidth = bbox.width + paddingX;
				d.bboxHeight = bbox.height + paddingY;

				g.insert("rect", "text")
					.attr("x", bbox.x - paddingX / 2)
					.attr("y", bbox.y - paddingY / 2)
					.attr("width", d.bboxWidth)
					.attr("height", d.bboxHeight)
					.attr("rx", 6)
					.attr("ry", 6)
					.attr("fill", "#fff")
					.attr("stroke", "#000");
			});

			return n;
		});

	//
	// --- 5. Node interaction ---
	//
	let selectedNode = null;
	let expandedPackages = new Set();
	let groupBoxes = [];

	function handleClick(event, d) {
		if (selectedNode === d) {
			selectedNode = null;
			node.select("rect").attr("fill", "#fff");
			link.attr("marker-end", "url(#arrows)")
				.style("stroke", "#aaa")
				.style("stroke-width", 1)
				.attr("opacity", 1);
			return;
		}

		selectedNode = d;

		node.select("rect").attr("fill", "#fff");
		d3.select(this).select("rect").attr("fill", "#ffcc00");

		link.attr("marker-end", (l) => {
			if (l.source === d) return "url(#arrows-out)";
			if (l.target === d) return "url(#arrows-in)";
			return "url(#arrows)";
		})
			.style("stroke", (l) => {
				if (l.source === d) return "#ff6600";
				if (l.target === d) return "#0066cc";
				return "#aaa";
			})
			.style("stroke-width", (l) =>
				l.source === d || l.target === d ? 3 : 1.5
			)
			.attr("opacity", (l) =>
				l.source === d || l.target === d ? 1 : 0.2
			);

		node.select("rect").attr("fill", (n) => {
			if (n === d) return "#ffcc00";
			const isOutgoing = link
				.data()
				.some((l) => l.source === d && l.target === n);
			const isIncoming = link
				.data()
				.some((l) => l.target === d && l.source === n);
			if (isOutgoing) return "#ff9966";
			if (isIncoming) return "#66b3ff";
			return "#fff";
		});
	}

	function handleDblClick(event, d) {
		if (d.type === "package") {
			if (expandedPackages.has(d.id)) {
				collapsePackage(d);
			} else {
				expandPackage(d);
			}
			restart();
		} else {
			// file node double-click still opens in VSCode
			showCodeSnippet(d);
		}
	}

	node.on("click", handleClick);

	node.on("dblclick", handleDblClick);

	// rebuild links depending on which nodes are visible
	function updateLinks() {
		links = data.links
			.map((l) => {
				let sNode = nodes.find((n) => n.id === l.source);
				let tNode = nodes.find((n) => n.id === l.target);

				if (!sNode) {
					const sPkg = data.nodes.find(
						(n) => n.id === l.source
					).package;
					sNode = nodes.find((n) => n.id === "pkg:" + sPkg);
				}
				if (!tNode) {
					const tPkg = data.nodes.find(
						(n) => n.id === l.target
					).package;
					tNode = nodes.find((n) => n.id === "pkg:" + tPkg);
				}

				return { source: sNode, target: tNode };
			})
			.filter((l) => l.source && l.target);
	}

	//
	// --- 6. Expand / Collapse packages ---
	//
	const pkgSpacing = new Map();

	function fileLabel(f) {
		return (f.name || "").split("\\").pop().split("/").pop();
	}

	function measureTextWidth(txt) {
		const t = measureLayer.append("text").text(txt);
		const w = t.node().getComputedTextLength();
		t.remove();
		return w;
	}

	function expandPackage(pkgNode) {
		expandedPackages.add(pkgNode.id);

		// remove the package node
		nodes = nodes.filter((n) => n.id !== pkgNode.id);

		const files = pkgNode.files;

		// compute & cache spacing once
		let spacing = pkgSpacing.get(pkgNode.id);
		if (!spacing) {
			const paddingX = 10;
			const paddingY = 6;

			// measure each file label with SVG
			const maxW =
				d3.max(files, (f) => measureTextWidth(fileLabel(f))) + paddingX;
			const maxH = 12 + paddingY; // assuming ~12px font-size

			spacing = {
				x: maxW * 1.8,
				y: maxH * 2.2,
			};

			pkgSpacing.set(pkgNode.id, spacing);
		}

		// layout
		const nCols = Math.ceil(Math.sqrt(files.length));
		const nRows = Math.ceil(files.length / nCols);

		const startX = pkgNode.x - ((nCols - 1) * spacing.x) / 2;
		const startY = pkgNode.y - ((nRows - 1) * spacing.y) / 2;

		files.forEach((f, i) => {
			const col = i % nCols;
			const row = Math.floor(i / nCols);
			f.x = startX + col * spacing.x;
			f.y = startY + row * spacing.y * 2;
			f.fx = f.x;
			f.fy = f.y;
		});

		// add file nodes
		nodes.push(...files);

		// add bounding box metadata
		groupBoxes.push({
			packageId: pkgNode.id,
			name: pkgNode.name,
			files: files,
		});

		updateLinks();
		restart();
		updateBoxes();
	}

	// Collapse package back into single node
	function collapsePackage(pkgNode) {
		expandedPackages.delete(pkgNode.id);

		// remove file nodes + bounding box
		nodes = nodes.filter((n) => !pkgNode.files.includes(n));
		groupBoxes = groupBoxes.filter((g) => g.packageId !== pkgNode.id);

		// add back package node
		nodes.push(pkgNode);

		updateLinks();
		restart();
	}

	function restart() {
		link = linkGroup
			.selectAll("path")
			.data(links)
			.join("path")
			.style("stroke", "#aaa")
			.attr("marker-end", "url(#arrows)");

		node = nodeGroup
			.selectAll(".node")
			.data(nodes, (d) => d.id)
			.join(
				(enter) => {
					const n = enter
						.append("g")
						.attr("class", "node")
						.call(
							d3
								.drag()
								.on("start", dragStarted)
								.on("drag", dragged)
								.on("end", dragEnded)
						);

					n.append("text")
						.attr("dy", 4)
						.style("text-anchor", "middle")
						.text((d) =>
							d.type === "package"
								? d.name
								: d.name.split("\\").pop().split("/").pop()
						);

					n.each(function (d) {
						const g = d3.select(this);
						const text = g.select("text");
						const bbox = text.node().getBBox();
						const paddingX = 10;
						const paddingY = 6;

						d.bboxWidth = bbox.width + paddingX;
						d.bboxHeight = bbox.height + paddingY;

						g.insert("rect", "text")
							.attr("x", bbox.x - paddingX / 2)
							.attr("y", bbox.y - paddingY / 2)
							.attr("width", d.bboxWidth)
							.attr("height", d.bboxHeight)
							.attr("rx", 6)
							.attr("ry", 6)
							.attr("fill", "#fff")
							.attr("stroke", "#000");
					});

					let selectedNode = null;

					node.on("click", function (event, d) {
						if (selectedNode === d) {
							selectedNode = null;
							node.select("rect").attr("fill", "#fff");
							link.attr("marker-end", "url(#arrows)")
								.style("stroke", "#aaa")
								.style("stroke-width", 1)
								.attr("opacity", 1);
							return;
						}

						selectedNode = d;

						node.select("rect").attr("fill", "#fff");
						d3.select(this).select("rect").attr("fill", "#ffcc00");

						link.attr("marker-end", (l) => {
							if (l.source === d) return "url(#arrows-out)";
							if (l.target === d) return "url(#arrows-in)";
							return "url(#arrows)";
						})
							.style("stroke", (l) => {
								if (l.source === d) return "#ff6600";
								if (l.target === d) return "#0066cc";
								return "#aaa";
							})
							.style("stroke-width", (l) =>
								l.source === d || l.target === d ? 3 : 1.5
							)
							.attr("opacity", (l) =>
								l.source === d || l.target === d ? 1 : 0.2
							);

						node.select("rect").attr("fill", (n) => {
							if (n === d) return "#ffcc00";
							const isOutgoing = link
								.data()
								.some((l) => l.source === d && l.target === n);
							const isIncoming = link
								.data()
								.some((l) => l.target === d && l.source === n);
							if (isOutgoing) return "#ff9966";
							if (isIncoming) return "#66b3ff";
							return "#fff";
						});
					});
					return n;
				},
				(update) => update,
				(exit) => exit.remove()
			);

		// rebind onclick and ondblclick
		node.on("click", handleClick);
		node.on("dblclick", handleDblClick);

		// draw bounding boxes for expanded packages
		let boxes = boxGroup
			.selectAll(".pkg-box")
			.data(groupBoxes, (d) => d.packageId);

		// ENTER: create new <g> elements
		const boxesEnter = boxes.enter().append("g").attr("class", "pkg-box");

		boxesEnter.call(
			d3
				.drag()
				.on("start", boxDragStarted)
				.on("drag", boxDragged)
				.on("end", boxDragEnded)
		);

		// Append a <rect> inside each new <g>
		boxesEnter
			.append("rect")
			.attr("rx", 12)
			.attr("ry", 12)
			.attr("fill", "rgba(200,200,255,0.15)")
			.attr("stroke", "#666")
			.attr("stroke-dasharray", "4 2")
			.lower()
			.on("dblclick", (event, d) => {
				const pkgNode = packageMap.get(d.name);
				collapsePackage(pkgNode);
			});

		// Optional: append package name text at top-left
		boxesEnter
			.append("text")
			.attr("class", "pkg-name")
			.attr("x", 8) // padding inside rect
			.attr("y", 14)
			.text((d) => d.name)
			.attr("font-size", "12px")
			.attr("font-weight", "bold")
			.attr("fill", "#333")
			.raise();

		// EXIT: remove boxes no longer in data
		boxes.exit().remove();

		// update box positions every tick
		simulation.on("tick", () => {
			link.attr("d", (d) => {
				const targetRectWidth = d.target.bboxWidth || 100;
				const targetRectHeight = d.target.bboxHeight || 30;

				const dx = d.target.x - d.source.x;
				const dy = d.target.y - d.source.y;

				const hw = targetRectWidth / 2;
				const hh = targetRectHeight / 2;

				const scaleX = hw / Math.abs(dx || 1);
				const scaleY = hh / Math.abs(dy || 1);
				const scale = Math.min(scaleX, scaleY);

				const endX = d.target.x - dx * scale;
				const endY = d.target.y - dy * scale;

				return `M${d.source.x},${d.source.y} L${endX},${endY}`;
			});

			node.attr("transform", (d) => `translate(${d.x},${d.y})`);

			// bounding boxes follow files
			g.selectAll(".pkg-box").each(function (d) {
				const minX =
					d3.min(d.files, (f) => f.x - (f.bboxWidth || 50) / 2) - 20;
				const maxX =
					d3.max(d.files, (f) => f.x + (f.bboxWidth || 50) / 2) + 20;
				const minY =
					d3.min(d.files, (f) => f.y - (f.bboxHeight || 20) / 2) - 20;
				const maxY =
					d3.max(d.files, (f) => f.y + (f.bboxHeight || 20) / 2) + 20;

				const boxWidth = maxX - minX;
				const boxHeight = maxY - minY + 30;

				const gBox = d3
					.select(this)
					.attr("transform", `translate(${minX},${minY - 20})`);

				gBox.select("rect")
					.attr("x", 0)
					.attr("y", 0)
					.attr("width", boxWidth)
					.attr("height", boxHeight);

				gBox.select("text.pkg-name").attr("x", 8).attr("y", 16);
			});
		});

		simulation.force("link").links(links);
		simulation.nodes(nodes);
		simulation.tick();
		ticked();
		updateBoxes();
	}

	//
	// --- 7. Force simulation ---
	//
	const simulation = d3
		.forceSimulation(nodes)
		.force(
			"link",
			d3
				.forceLink()
				.id((d) => d.id)
				.links(links)
		)
		.force("charge", d3.forceManyBody().strength(-1000))
		.force("x", d3.forceX())
		.force("y", d3.forceY())
		.force("center", d3.forceCenter(width / 2, height / 2))
		.force(
			"collide",
			d3.forceCollide((d) => 130)
		)
		//.force("boxRepel", forceBoxRepel(-5))
		.alphaDecay(0.05)
		.velocityDecay(0.5)
		.on("tick", ticked);

	function ticked() {
		link.attr("d", linkPath);

		node.attr("transform", (d) => `translate(${d.x},${d.y})`);
		updateBoxes();
	}

	//
	// --- 8. Drag handlers ---
	//
	function linkPath(d) {
		const getEdgePoint = (source, target) => {
			const w = source.bboxWidth || 100;
			const h = source.bboxHeight || 30;

			const dx = target.x - source.x;
			const dy = target.y - source.y;

			const hw = w / 2;
			const hh = h / 2;

			const scaleX = hw / Math.abs(dx || 1);
			const scaleY = hh / Math.abs(dy || 1);
			const scale = Math.min(scaleX, scaleY);

			return {
				x: source.x + dx * scale,
				y: source.y + dy * scale,
			};
		};

		const p1 = getEdgePoint(d.source, d.target);
		const p2 = getEdgePoint(d.target, d.source);

		return `M${p1.x},${p1.y} L${p2.x},${p2.y}`;
	}

	function dragStarted(event, d) {
		d.fx = d.x;
		d.fy = d.y;
	}

	function dragged(event, d) {
		d.x = event.x;
		d.y = event.y;
		d.fx = event.x;
		d.fy = event.y;
		// Let the tick handler move links/nodes. But keep boxes in sync now:
		updateBoxes();
		simulation.alpha(0).restart();

		// move dragged node
		d3.select(this).attr("transform", `translate(${event.x},${event.y})`);

		// update link positions using rectangle edge math
		link.attr("d", linkPath);
	}

	function dragEnded(event, d) {
		d.fx = event.x;
		d.fy = event.y;
	}

	function boxDragStarted(event, d) {
		if (!event.active) simulation.alphaTarget(0).restart();
		// Fix positions of all children before drag
		d.files.forEach((f) => {
			f.fx = f.x;
			f.fy = f.y;
		});
	}

	function boxDragged(event, d) {
		// Shift all files by the drag delta
		d.files.forEach((f) => {
			f.fx += event.dx;
			f.fy += event.dy;
			f.x = f.fx;
			f.y = f.fy;
		});
		simulation.alpha(0).restart();

		updateBoxes(); // resize + reposition box
		//simulation.alpha(0).restart(); // heat sim so others react (repel)
	}

	function boxDragEnded(event, d) {
		// (!event.active) simulation.alphaTarget(0.3).restart();
		// Release all children so sim can move them again
		d.files.forEach((f) => {
			f.fx = f.x;
			f.fy = f.y;
		});
		//updateBoxes(); // resize + reposition box
		if (!event.active) simulation.alphaTarget(0).restart();
	}

	function updateBoxes() {
		g.selectAll(".pkg-box").each(function (d) {
			// make sure this package has files
			if (!d || !d.files || d.files.length === 0) {
				console.warn("no files for box:", d);
				return;
			}

			// calculate bounds from children
			const minX =
				d3.min(d.files, (f) => (f.x || 0) - (f.bboxWidth || 50) / 2) -
				20;
			const maxX =
				d3.max(d.files, (f) => (f.x || 0) + (f.bboxWidth || 50) / 2) +
				20;
			const minY =
				d3.min(d.files, (f) => (f.y || 0) - (f.bboxHeight || 20) / 2) -
				20;
			const maxY =
				d3.max(d.files, (f) => (f.y || 0) + (f.bboxHeight || 20) / 2) +
				20;

			// box dimensions
			const boxWidth = maxX - minX;
			const boxHeight = maxY - minY + 30; // +30 for title space

			// 🔑 Persist bounds into the data for forceBoxRepel
			d.bounds = { minX, maxX, minY, maxY };
			d.repulsionBounds = {
				minX: minX - 40,
				maxX: maxX + 40,
				minY: minY - 40,
				maxY: maxY + 40,
			};

			// move the whole group to top-left corner
			const gBox = d3
				.select(this)
				.attr("transform", `translate(${minX},${minY - 20})`);

			// update rect
			gBox.select("rect")
				.attr("x", 0)
				.attr("y", 0)
				.attr("width", boxWidth)
				.attr("height", boxHeight);

			// update package name label
			gBox.select("text.pkg-name").attr("x", 8).attr("y", 16);
		});
	}

	// 	function forceBoxRepel(strength = -0.8) {
	// 		let nodes;

	// 		function force(alpha) {
	// 			if (!nodes) return;

	// 			// 1. Box ↔ Node repel
	// 			groupBoxes.forEach((box) => {
	// 				if (!box.bounds) return;
	// 				const { minX, maxX, minY, maxY } = box.bounds;

	// 				nodes.forEach((n) => {
	// 					if (box.files.includes(n)) return; // skip children

	// 					const insideX = n.x > minX && n.x < maxX;
	// 					const insideY = n.y > minY && n.y < maxY;

	// 					if (insideX && insideY) {
	// 						const dx = Math.min(n.x - minX, maxX - n.x);
	// 						const dy = Math.min(n.y - minY, maxY - n.y);

	// 						if (dx < dy) {
	// 							n.vx +=
	// 								(n.x < (minX + maxX) / 2 ? -1 : 1) *
	// 								Math.abs(strength) *
	// 								alpha *
	// 								10;
	// 						} else {
	// 							n.vy +=
	// 								(n.y < (minY + maxY) / 2 ? -1 : 1) *
	// 								Math.abs(strength) *
	// 								alpha *
	// 								10;
	// 						}
	// 					}
	// 				});
	// 			});

	// 			// 2. Box ↔ Box repel
	// 			for (let i = 0; i < groupBoxes.length; i++) {
	// 				for (let j = i + 1; j < groupBoxes.length; j++) {
	// 					const a = groupBoxes[i];
	// 					const b = groupBoxes[j];
	// 					if (!a.bounds || !b.bounds) continue;

	// 					const overlapX =
	// 						Math.min(a.bounds.maxX, b.bounds.maxX) -
	// 						Math.max(a.bounds.minX, b.bounds.minX);
	// 					const overlapY =
	// 						Math.min(a.bounds.maxY, b.bounds.maxY) -
	// 						Math.max(a.bounds.minY, b.bounds.minY);

	// 					if (overlapX > 0 && overlapY > 0) {
	// 						// overlap exists → push boxes apart
	// 						const centerAx = (a.bounds.minX + a.bounds.maxX) / 2;
	// 						const centerAy = (a.bounds.minY + a.bounds.maxY) / 2;
	// 						const centerBx = (b.bounds.minX + b.bounds.maxX) / 2;
	// 						const centerBy = (b.bounds.minY + b.bounds.maxY) / 2;

	// 						const dx = centerBx - centerAx;
	// 						const dy = centerBy - centerAy;
	// 						const dist = Math.sqrt(dx * dx + dy * dy) || 1;

	// 						const push =
	// 							(Math.min(overlapX, overlapY) / dist) *
	// 							strength *
	// 							alpha *
	// 							20;

	// 						// apply to all files in each package
	// 						a.files.forEach((n) => {
	// 							n.vx += (dx / dist) * push;
	// 							n.vy += (dy / dist) * push;
	// 						});
	// 						b.files.forEach((n) => {
	// 							n.vx -= (dx / dist) * push;
	// 							n.vy -= (dy / dist) * push;
	// 						});
	// 					}
	// 				}
	// 			}
	// 		}

	// 		force.initialize = (_) => (nodes = _);
	// 		return force;
	// 	}
});

// Redirect to VSCode upon double clicking a file
function showCodeSnippet(nodeData) {
	if (!nodeData.name) return;
	const filePath = nodeData.name.replace(/\\/g, "/");
	const vscodeUri = `vscode://file/${filePath}:1`;
	window.location.href = vscodeUri;
}
