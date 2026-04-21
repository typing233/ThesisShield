class LogicGraphVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('Canvas element not found:', canvasId);
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            console.error('2D context not available');
            return;
        }
        
        this.nodes = [];
        this.links = [];
        this.animationProgress = 0;
        this.isAnimating = false;
        this.hoveredNode = null;
        this.selectedNode = null;
        this.draggingNode = null;
        this.dragOffset = { x: 0, y: 0 };
        
        this.nodeRadius = 35;
        this.colors = {
            claim: '#667eea',
            evidence: '#48bb78',
            assumption: '#ed8936',
            attack: '#f56565',
            link: '#cbd5e0',
            linkActive: '#667eea',
            background: '#f7fafc'
        };
        
        this.init();
    }
    
    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
        
        this.animate();
    }
    
    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = Math.max(400, rect.width * 0.6);
    }
    
    setData(statements, links) {
        this.nodes = statements.map((stmt, index) => ({
            id: stmt.id,
            content: stmt.content,
            type: stmt.type || 'claim',
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            fixed: false,
            visible: false,
            confidence: stmt.confidence || 1,
            metadata: stmt.metadata || {}
        }));
        
        this.links = links.map((link, index) => ({
            id: link.id || `link_${index}`,
            source: link.source_id,
            target: link.target_id,
            type: link.relation_type || 'supports',
            strength: link.strength || 0.5,
            visible: false,
            active: false
        }));
        
        this.layoutNodes();
        this.isAnimating = true;
        this.animationProgress = 0;
    }
    
    layoutNodes() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        const claims = this.nodes.filter(n => n.type === 'claim');
        const evidences = this.nodes.filter(n => n.type === 'evidence');
        const assumptions = this.nodes.filter(n => n.type === 'assumption');
        
        claims.forEach((node, i) => {
            const angle = (i / claims.length) * Math.PI * 2 - Math.PI / 2;
            const radius = 120;
            node.x = centerX + Math.cos(angle) * radius;
            node.y = centerY + Math.sin(angle) * radius;
        });
        
        evidences.forEach((node, i) => {
            const angle = (i / evidences.length) * Math.PI * 2 + Math.PI / 4;
            const radius = 220;
            node.x = centerX + Math.cos(angle) * radius;
            node.y = centerY + Math.sin(angle) * radius;
        });
        
        assumptions.forEach((node, i) => {
            const angle = (i / assumptions.length) * Math.PI * 2 + Math.PI / 2;
            const radius = 80;
            node.x = centerX + Math.cos(angle) * radius;
            node.y = centerY + Math.sin(angle) * radius;
        });
    }
    
    updatePhysics() {
        const damping = 0.9;
        const repulsion = 5000;
        const attraction = 0.01;
        
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const dx = this.nodes[j].x - this.nodes[i].x;
                const dy = this.nodes[j].y - this.nodes[i].y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = repulsion / (dist * dist);
                
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                this.nodes[i].vx -= fx;
                this.nodes[i].vy -= fy;
                this.nodes[j].vx += fx;
                this.nodes[j].vy += fy;
            }
        }
        
        this.links.forEach(link => {
            const source = this.nodes.find(n => n.id === link.source);
            const target = this.nodes.find(n => n.id === link.target);
            
            if (source && target) {
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const force = dist * attraction * link.strength;
                
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                if (!source.fixed) {
                    source.vx += fx;
                    source.vy += fy;
                }
                if (!target.fixed) {
                    target.vx -= fx;
                    target.vy -= fy;
                }
            }
        });
        
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.nodes.forEach(node => {
            if (!node.fixed) {
                node.vx += (centerX - node.x) * 0.001;
                node.vy += (centerY - node.y) * 0.001;
                node.vx *= damping;
                node.vy *= damping;
                node.x += node.vx;
                node.y += node.vy;
                
                node.x = Math.max(this.nodeRadius, Math.min(this.canvas.width - this.nodeRadius, node.x));
                node.y = Math.max(this.nodeRadius, Math.min(this.canvas.height - this.nodeRadius, node.y));
            }
        });
    }
    
    animate() {
        this.updatePhysics();
        this.render();
        requestAnimationFrame(() => this.animate());
    }
    
    render() {
        if (!this.ctx) return;
        
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.renderGrid();
        
        if (this.isAnimating && this.animationProgress < 1) {
            this.animationProgress += 0.02;
            if (this.animationProgress >= 1) {
                this.animationProgress = 1;
                this.isAnimating = false;
            }
        }
        
        this.links.forEach((link, index) => {
            const delay = index * 0.1;
            const progress = Math.max(0, Math.min(1, (this.animationProgress - delay) / 0.3));
            
            if (progress > 0) {
                this.renderLink(link, progress);
            }
        });
        
        this.nodes.forEach((node, index) => {
            const delay = index * 0.08;
            const progress = Math.max(0, Math.min(1, (this.animationProgress - delay) / 0.3));
            
            if (progress > 0) {
                this.renderNode(node, progress);
            }
        });
    }
    
    renderGrid() {
        this.ctx.strokeStyle = 'rgba(203, 213, 224, 0.3)';
        this.ctx.lineWidth = 1;
        
        const gridSize = 50;
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    renderLink(link, progress) {
        const source = this.nodes.find(n => n.id === link.source);
        const target = this.nodes.find(n => n.id === link.target);
        
        if (!source || !target) return;
        
        const startX = source.x;
        const startY = source.y;
        const endX = target.x;
        const endY = target.y;
        
        const currentX = startX + (endX - startX) * progress;
        const currentY = startY + (endY - startY) * progress;
        
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(currentX, currentY);
        
        if (link.type === 'supports') {
            this.ctx.strokeStyle = link.active ? this.colors.linkActive : this.colors.link;
            this.ctx.setLineDash([]);
        } else if (link.type === 'contradicts') {
            this.ctx.strokeStyle = '#f56565';
            this.ctx.setLineDash([5, 5]);
        } else if (link.type === 'assumes') {
            this.ctx.strokeStyle = '#ed8936';
            this.ctx.setLineDash([10, 5]);
        } else {
            this.ctx.strokeStyle = this.colors.link;
            this.ctx.setLineDash([]);
        }
        
        this.ctx.lineWidth = link.strength * 3 + 1;
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        if (progress >= 0.9) {
            const angle = Math.atan2(endY - startY, endX - startX);
            const arrowLength = 10;
            
            this.ctx.beginPath();
            this.ctx.moveTo(endX, endY);
            this.ctx.lineTo(
                endX - arrowLength * Math.cos(angle - Math.PI / 6),
                endY - arrowLength * Math.sin(angle - Math.PI / 6)
            );
            this.ctx.lineTo(
                endX - arrowLength * Math.cos(angle + Math.PI / 6),
                endY - arrowLength * Math.sin(angle + Math.PI / 6)
            );
            this.ctx.closePath();
            this.ctx.fillStyle = this.ctx.strokeStyle;
            this.ctx.fill();
        }
    }
    
    renderNode(node, progress) {
        const isHovered = this.hoveredNode === node;
        const isSelected = this.selectedNode === node;
        const radius = this.nodeRadius * progress * (isHovered ? 1.1 : 1);
        
        const gradient = this.ctx.createRadialGradient(
            node.x, node.y, 0,
            node.x, node.y, radius * 2
        );
        
        const baseColor = this.colors[node.type] || this.colors.claim;
        gradient.addColorStop(0, baseColor + '40');
        gradient.addColorStop(1, baseColor + '00');
        
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius * 2, 0, Math.PI * 2);
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        
        if (isSelected) {
            this.ctx.strokeStyle = '#4a5568';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
        
        this.ctx.fillStyle = baseColor;
        this.ctx.fill();
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 14px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        const typeLabels = {
            claim: '主张',
            evidence: '证据',
            assumption: '假设'
        };
        this.ctx.fillText(typeLabels[node.type] || node.type, node.x, node.y - 5);
        
        this.ctx.font = '10px Inter, sans-serif';
        this.ctx.fillStyle = 'rgba(255,255,255,0.8)';
        this.ctx.fillText(`${Math.round(node.confidence * 100)}%`, node.x, node.y + 12);
        
        if (isHovered && node.content) {
            this.renderTooltip(node);
        }
    }
    
    renderTooltip(node) {
        const padding = 12;
        const maxWidth = 250;
        
        const words = node.content.split(' ');
        const lines = [];
        let currentLine = words[0] || '';
        
        this.ctx.font = '13px Inter, sans-serif';
        
        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            const metrics = this.ctx.measureText(testLine);
            
            if (metrics.width > maxWidth - padding * 2) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        
        const lineHeight = 20;
        const tooltipWidth = maxWidth;
        const tooltipHeight = lines.length * lineHeight + padding * 2;
        
        let x = node.x + this.nodeRadius + 15;
        let y = node.y - tooltipHeight / 2;
        
        if (x + tooltipWidth > this.canvas.width) {
            x = node.x - this.nodeRadius - tooltipWidth - 15;
        }
        if (y < 10) y = 10;
        if (y + tooltipHeight > this.canvas.height - 10) {
            y = this.canvas.height - tooltipHeight - 10;
        }
        
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, tooltipWidth, tooltipHeight, 8);
        this.ctx.fillStyle = 'rgba(45, 55, 72, 0.95)';
        this.ctx.fill();
        
        this.ctx.fillStyle = 'white';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        lines.forEach((line, i) => {
            this.ctx.fillText(line, x + padding, y + padding + i * lineHeight);
        });
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.draggingNode) {
            this.draggingNode.x = x - this.dragOffset.x;
            this.draggingNode.y = y - this.dragOffset.y;
            return;
        }
        
        let found = null;
        for (const node of this.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < this.nodeRadius) {
                found = node;
                break;
            }
        }
        
        if (found !== this.hoveredNode) {
            this.hoveredNode = found;
            this.canvas.style.cursor = found ? 'pointer' : 'default';
            
            if (found) {
                this.links.forEach(link => {
                    link.active = link.source === found.id || link.target === found.id;
                });
            } else {
                this.links.forEach(link => {
                    link.active = false;
                });
            }
        }
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        for (const node of this.nodes) {
            const dx = x - node.x;
            const dy = y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < this.nodeRadius) {
                this.selectedNode = node;
                this.draggingNode = node;
                this.dragOffset = { x: dx, y: dy };
                node.fixed = true;
                break;
            }
        }
    }
    
    handleMouseUp(e) {
        if (this.draggingNode) {
            this.draggingNode.fixed = false;
            this.draggingNode = null;
        }
    }
    
    highlightNode(nodeId) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) {
            this.selectedNode = node;
            this.links.forEach(link => {
                link.active = link.source === nodeId || link.target === nodeId;
            });
        }
    }
    
    clearHighlight() {
        this.selectedNode = null;
        this.links.forEach(link => {
            link.active = false;
        });
    }
    
    playAnimation() {
        this.animationProgress = 0;
        this.isAnimating = true;
    }
    
    getNodeInfo() {
        return this.nodes.map(node => ({
            id: node.id,
            content: node.content,
            type: node.type,
            confidence: node.confidence,
            x: node.x,
            y: node.y
        }));
    }
}

class ScrollNarrativeController {
    constructor(visualizer, containerId) {
        this.visualizer = visualizer;
        this.container = document.getElementById(containerId);
        this.sections = [];
        this.currentSection = -1;
        
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const index = parseInt(entry.target.dataset.sectionIndex);
                        if (index !== this.currentSection) {
                            this.activateSection(index);
                        }
                    }
                });
            },
            { threshold: 0.5 }
        );
        
        const sectionElements = this.container.querySelectorAll('.narrative-section');
        sectionElements.forEach((el, index) => {
            el.dataset.sectionIndex = index;
            observer.observe(el);
        });
    }
    
    setSections(sections) {
        this.sections = sections;
        this.renderSections();
    }
    
    renderSections() {
        if (!this.container) return;
        
        this.container.innerHTML = '';
        
        this.sections.forEach((section, index) => {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'narrative-section min-h-[300px] flex items-center py-16';
            sectionEl.dataset.sectionIndex = index;
            
            sectionEl.innerHTML = `
                <div class="max-w-2xl mx-auto px-6">
                    <div class="bg-white rounded-xl shadow-lg p-8 border-l-4 ${
                        section.type === 'claim' ? 'border-purple-500' :
                        section.type === 'evidence' ? 'border-green-500' : 'border-orange-500'
                    }">
                        <div class="flex items-center mb-4">
                            <span class="text-4xl font-bold text-gray-200 mr-4">${index + 1}</span>
                            <div>
                                <span class="inline-block px-3 py-1 rounded-full text-xs font-medium ${
                                    section.type === 'claim' ? 'bg-purple-100 text-purple-800' :
                                    section.type === 'evidence' ? 'bg-green-100 text-green-800' : 
                                    'bg-orange-100 text-orange-800'
                                }">
                                    ${section.type === 'claim' ? '核心主张' : 
                                      section.type === 'evidence' ? '支撑证据' : '隐含假设'}
                                </span>
                                <h3 class="text-xl font-semibold text-gray-800 mt-2">${section.title}</h3>
                            </div>
                        </div>
                        <p class="text-gray-600 leading-relaxed">${section.content}</p>
                        ${section.connections ? `
                            <div class="mt-4 pt-4 border-t border-gray-100">
                                <p class="text-sm text-gray-500">
                                    <span class="font-medium">关联：</span>${section.connections}
                                </p>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            
            this.container.appendChild(sectionEl);
        });
        
        this.init();
    }
    
    activateSection(index) {
        if (index < 0 || index >= this.sections.length) return;
        
        this.currentSection = index;
        const section = this.sections[index];
        
        if (section.nodeId && this.visualizer) {
            this.visualizer.highlightNode(section.nodeId);
        }
        
        const sectionElements = this.container.querySelectorAll('.narrative-section');
        sectionElements.forEach((el, i) => {
            const card = el.querySelector('.bg-white');
            if (card) {
                if (i === index) {
                    card.classList.add('ring-2', 'ring-purple-300');
                } else {
                    card.classList.remove('ring-2', 'ring-purple-300');
                }
            }
        });
    }
}
