class AttackSandbox {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.nodes = [];
        this.attacks = [];
        this.editingNode = null;
        this.onRetestCallback = null;
        
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        this.container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2">
                    <div class="bg-white rounded-xl shadow-lg p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                            <svg class="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                            </svg>
                            攻防推演沙盘
                        </h3>
                        <div id="sandboxCanvas" class="relative min-h-[400px] bg-gray-50 rounded-lg overflow-hidden border-2 border-dashed border-gray-200">
                            <div id="sandboxNodes" class="absolute inset-0"></div>
                            <svg id="sandboxLinks" class="absolute inset-0 w-full h-full pointer-events-none"></svg>
                            <div id="attackEffects" class="absolute inset-0 pointer-events-none"></div>
                        </div>
                    </div>
                </div>
                
                <div class="space-y-6">
                    <div id="attackPanel" class="bg-white rounded-xl shadow-lg p-6">
                        <h4 class="font-semibold text-gray-800 mb-3 flex items-center">
                            <svg class="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                            </svg>
                            攻击详情
                        </h4>
                        <div id="attackDetails" class="text-gray-500 text-sm">
                            点击受攻击的节点查看详情
                        </div>
                    </div>
                    
                    <div id="editorPanel" class="bg-white rounded-xl shadow-lg p-6 hidden">
                        <h4 class="font-semibold text-gray-800 mb-3 flex items-center">
                            <svg class="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                            局部编辑器
                        </h4>
                        <div id="editorContent">
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                修改陈述内容
                            </label>
                            <textarea id="editTextarea" rows="4" 
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm resize-vertical"
                                placeholder="输入修改后的陈述内容..."></textarea>
                            <div class="mt-4 flex gap-3">
                                <button id="retestBtn" class="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium flex items-center justify-center">
                                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                    </svg>
                                    防御重测
                                </button>
                                <button id="cancelEditBtn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium">
                                    取消
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div id="retestResultPanel" class="bg-white rounded-xl shadow-lg p-6 hidden">
                        <h4 class="font-semibold text-gray-800 mb-3 flex items-center">
                            <svg class="w-5 h-5 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            重测结果
                        </h4>
                        <div id="retestResultContent"></div>
                    </div>
                </div>
            </div>
        `;
        
        this.bindEvents();
    }
    
    bindEvents() {
        const retestBtn = this.container.querySelector('#retestBtn');
        const cancelEditBtn = this.container.querySelector('#cancelEditBtn');
        
        if (retestBtn) {
            retestBtn.addEventListener('click', () => this.handleRetest());
        }
        
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', () => this.closeEditor());
        }
    }
    
    setData(nodes, attacks, links = []) {
        this.nodes = nodes.map(node => ({
            ...node,
            x: 0,
            y: 0,
            underAttack: attacks.some(a => a.target_statement_id === node.id),
            attackData: attacks.filter(a => a.target_statement_id === node.id)
        }));
        
        this.attacks = attacks;
        this.links = links;
        
        this.layoutNodes();
        this.render();
    }
    
    layoutNodes() {
        const canvas = this.container.querySelector('#sandboxCanvas');
        if (!canvas) return;
        
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;
        
        const centerX = width / 2;
        const centerY = height / 2;
        
        const attackedNodes = this.nodes.filter(n => n.underAttack);
        const safeNodes = this.nodes.filter(n => !n.underAttack);
        
        attackedNodes.forEach((node, i) => {
            const angle = (i / attackedNodes.length) * Math.PI * 2;
            const radius = Math.min(width, height) * 0.25;
            node.x = centerX + Math.cos(angle) * radius;
            node.y = centerY + Math.sin(angle) * radius;
        });
        
        safeNodes.forEach((node, i) => {
            const angle = (i / Math.max(safeNodes.length, 1)) * Math.PI * 2 + Math.PI / 4;
            const radius = Math.min(width, height) * 0.15;
            node.x = centerX + Math.cos(angle) * radius;
            node.y = centerY + Math.sin(angle) * radius;
        });
    }
    
    render() {
        this.renderLinks();
        this.renderNodes();
    }
    
    renderLinks() {
        const svg = this.container.querySelector('#sandboxLinks');
        if (!svg) return;
        
        svg.innerHTML = '';
        
        this.links.forEach(link => {
            const source = this.nodes.find(n => n.id === link.source_id);
            const target = this.nodes.find(n => n.id === link.target_id);
            
            if (!source || !target) return;
            
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', source.x);
            line.setAttribute('y1', source.y);
            line.setAttribute('x2', target.x);
            line.setAttribute('y2', target.y);
            line.setAttribute('stroke', link.relation_type === 'supports' ? '#48bb78' : '#cbd5e0');
            line.setAttribute('stroke-width', (link.strength || 0.5) * 2 + 1);
            line.setAttribute('stroke-dasharray', link.relation_type === 'assumes' ? '5,5' : 'none');
            
            svg.appendChild(line);
        });
    }
    
    renderNodes() {
        const nodesContainer = this.container.querySelector('#sandboxNodes');
        if (!nodesContainer) return;
        
        nodesContainer.innerHTML = '';
        
        this.nodes.forEach(node => {
            const nodeEl = document.createElement('div');
            nodeEl.className = `absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300`;
            nodeEl.style.left = `${node.x}px`;
            nodeEl.style.top = `${node.y}px`;
            
            const isAttacked = node.underAttack;
            const attackSeverity = isAttacked ? Math.max(...node.attackData.map(a => a.severity || 0)) : 0;
            
            let borderColor, bgColor, pulseClass;
            if (isAttacked) {
                borderColor = attackSeverity > 0.7 ? 'border-red-500' : attackSeverity > 0.4 ? 'border-orange-500' : 'border-yellow-500';
                bgColor = attackSeverity > 0.7 ? 'bg-red-50' : 'bg-orange-50';
                pulseClass = attackSeverity > 0.7 ? 'animate-pulse' : '';
            } else {
                borderColor = node.type === 'claim' ? 'border-purple-500' : node.type === 'evidence' ? 'border-green-500' : 'border-orange-500';
                bgColor = 'bg-white';
                pulseClass = '';
            }
            
            nodeEl.innerHTML = `
                <div class="relative ${pulseClass}">
                    ${isAttacked ? `
                        <div class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg z-10">
                            ${node.attackData.length}
                        </div>
                    ` : ''}
                    <div class="w-16 h-16 ${bgColor} rounded-full border-3 ${borderColor} flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow">
                        <div class="text-center">
                            <div class="text-xs font-bold ${isAttacked ? 'text-red-600' : 'text-gray-700'}">
                                ${node.type === 'claim' ? '主张' : node.type === 'evidence' ? '证据' : '假设'}
                            </div>
                        </div>
                    </div>
                    ${isAttacked ? `
                        <div class="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                            <svg class="w-8 h-8 text-red-500 animate-bounce" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M0 0h24v24H0z" fill="none"/>
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                            </svg>
                        </div>
                    ` : ''}
                </div>
            `;
            
            nodeEl.addEventListener('click', () => this.handleNodeClick(node));
            nodesContainer.appendChild(nodeEl);
        });
    }
    
    handleNodeClick(node) {
        this.showAttackDetails(node);
        
        if (node.underAttack) {
            this.showEditor(node);
        }
    }
    
    showAttackDetails(node) {
        const detailsPanel = this.container.querySelector('#attackDetails');
        if (!detailsPanel) return;
        
        if (!node.underAttack || node.attackData.length === 0) {
            detailsPanel.innerHTML = `
                <div class="text-center py-4">
                    <svg class="w-12 h-12 mx-auto text-green-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-green-600 font-medium">该节点暂无攻击</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        node.attackData.forEach((attack, index) => {
            const severityColor = attack.severity > 0.7 ? 'bg-red-100 text-red-800' : 
                                 attack.severity > 0.4 ? 'bg-orange-100 text-orange-800' : 
                                 'bg-yellow-100 text-yellow-800';
            
            html += `
                <div class="border-l-4 border-red-400 pl-4 mb-4 last:mb-0">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="${severityColor} text-xs px-2 py-1 rounded font-medium">
                            ${attack.attack_type}
                        </span>
                        <span class="text-xs text-gray-500">
                            严重度: ${Math.round((attack.severity || 0) * 100)}%
                        </span>
                    </div>
                    <p class="text-gray-700 text-sm mb-2">${attack.question}</p>
                    <div class="bg-green-50 rounded p-3">
                        <p class="text-xs font-medium text-green-700 mb-1">建议：</p>
                        <p class="text-sm text-green-600">${attack.suggestion}</p>
                    </div>
                </div>
            `;
        });
        
        detailsPanel.innerHTML = html;
    }
    
    showEditor(node) {
        this.editingNode = node;
        const editorPanel = this.container.querySelector('#editorPanel');
        const textarea = this.container.querySelector('#editTextarea');
        
        if (editorPanel) {
            editorPanel.classList.remove('hidden');
        }
        
        if (textarea && node.content) {
            textarea.value = node.content;
        }
    }
    
    closeEditor() {
        this.editingNode = null;
        const editorPanel = this.container.querySelector('#editorPanel');
        const retestResultPanel = this.container.querySelector('#retestResultPanel');
        
        if (editorPanel) {
            editorPanel.classList.add('hidden');
        }
        
        if (retestResultPanel) {
            retestResultPanel.classList.add('hidden');
        }
    }
    
    setOnRetestCallback(callback) {
        this.onRetestCallback = callback;
    }
    
    async handleRetest() {
        if (!this.editingNode || !this.onRetestCallback) return;
        
        const textarea = this.container.querySelector('#editTextarea');
        const retestBtn = this.container.querySelector('#retestBtn');
        const originalText = this.editingNode.content;
        const modifiedText = textarea ? textarea.value : '';
        
        const attack = this.editingNode.attackData[0];
        
        if (retestBtn) {
            retestBtn.disabled = true;
            retestBtn.innerHTML = `
                <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                检测中...
            `;
        }
        
        try {
            const result = await this.onRetestCallback({
                statement_id: this.editingNode.id,
                original_text: originalText,
                modified_text: modifiedText,
                attack_type: attack ? attack.attack_type : '未知'
            });
            
            this.showRetestResult(result);
            
        } catch (error) {
            console.error('Retest failed:', error);
            this.showRetestResult({
                is_defended: false,
                score: 0,
                feedback: '重测失败，请稍后重试。',
                suggestion: error.message
            });
        } finally {
            if (retestBtn) {
                retestBtn.disabled = false;
                retestBtn.innerHTML = `
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                    防御重测
                `;
            }
        }
    }
    
    showRetestResult(result) {
        const resultPanel = this.container.querySelector('#retestResultPanel');
        const resultContent = this.container.querySelector('#retestResultContent');
        
        if (!resultPanel || !resultContent) return;
        
        resultPanel.classList.remove('hidden');
        
        const scorePercent = Math.round((result.score || 0) * 100);
        const isSuccess = result.is_defended;
        
        resultContent.innerHTML = `
            <div class="text-center mb-4">
                <div class="inline-flex items-center justify-center w-20 h-20 rounded-full ${isSuccess ? 'bg-green-100' : 'bg-red-100'} mb-3">
                    ${isSuccess ? `
                        <svg class="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                    ` : `
                        <svg class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    `}
                </div>
                <div class="text-3xl font-bold ${isSuccess ? 'text-green-600' : 'text-red-600'}">
                    ${scorePercent}%
                </div>
                <p class="text-sm text-gray-500 mt-1">
                    ${isSuccess ? '防御成功！' : '需要进一步改进'}
                </p>
            </div>
            
            <div class="bg-gray-50 rounded-lg p-4 mb-4">
                <p class="text-sm text-gray-700">${result.feedback}</p>
            </div>
            
            ${result.suggestion ? `
                <div class="border-l-4 border-blue-400 pl-4">
                    <p class="text-xs font-medium text-blue-700 mb-1">进一步建议：</p>
                    <p class="text-sm text-blue-600">${result.suggestion}</p>
                </div>
            ` : ''}
        `;
    }
    
    playAttackAnimation(nodeId) {
        const effectsContainer = this.container.querySelector('#attackEffects');
        const node = this.nodes.find(n => n.id === nodeId);
        
        if (!effectsContainer || !node) return;
        
        const effect = document.createElement('div');
        effect.className = 'absolute w-32 h-32 rounded-full pointer-events-none';
        effect.style.left = `${node.x - 64}px`;
        effect.style.top = `${node.y - 64}px`;
        effect.style.background = 'radial-gradient(circle, rgba(239, 68, 68, 0.6) 0%, transparent 70%)';
        effect.style.animation = 'ping 1s cubic-bezier(0, 0, 0.2, 1) 3';
        
        effectsContainer.appendChild(effect);
        
        setTimeout(() => effect.remove(), 3000);
    }
}
