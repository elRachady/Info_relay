document.addEventListener('DOMContentLoaded', function() {
  // Éléments de l'interface
  const createAlertBtn = document.getElementById('create-alert-btn');
  const verifyAlertBtn = document.getElementById('verify-alert-btn');
  const backToAlertsBtn = document.getElementById('back-to-alerts');
  const backToAlertsFromVerifyBtn = document.getElementById('back-to-alerts-from-verify');
  const alertForm = document.getElementById('alert-form');
  const verifyAlertManuallyBtn = document.getElementById('verify-alert-manually');
  const startScannerBtn = document.getElementById('start-scanner');
  const stopScannerBtn = document.getElementById('stop-scanner');
  const downloadQrBtn = document.getElementById('download-qr');
  
  // Écrans
  const alertsScreen = document.getElementById('alerts-screen');
  const createAlertScreen = document.getElementById('create-alert-screen');
  const verifyAlertScreen = document.getElementById('verify-alert-screen');
  
  // Onglets de vérification
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.verify-tab-content');
  
  // Variables pour le scanner QR
  let qrScannerActive = false;
  let videoStream = null;

  // Fonction de notification moderne
  function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.padding = '10px 20px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '1000';
    notification.style.color = 'white';
    notification.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
    notification.style.animation = 'fadeIn 0.3s ease-in-out';
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'fadeOut 0.3s ease-in-out';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }

  // Charger les alertes au démarrage
  loadAlerts();
  
  // Gestion des événements
  createAlertBtn.addEventListener('click', () => showScreen('create-alert'));
  verifyAlertBtn.addEventListener('click', () => showScreen('verify-alert'));
  backToAlertsBtn.addEventListener('click', () => showScreen('alerts'));
  backToAlertsFromVerifyBtn.addEventListener('click', () => showScreen('alerts'));
  
  // Gestion des onglets de vérification
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
  
  // Soumission du formulaire d'alerte
  alertForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const type = document.getElementById('alert-type').value;
    const location = document.getElementById('alert-location').value;
    const message = document.getElementById('alert-message').value;
    const source = document.getElementById('alert-source').value;
    
    try {
      const response = await fetch('/api/alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, location, message, source }),
      });
      
      if (!response.ok) throw new Error('Erreur lors de la création de l\'alerte');
      
      const alert = await response.json();
      
      // Générer le QR code
      const qrResponse = await fetch('/api/alert/qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          fullMessage: alert.fullMessage, 
          signature: alert.signature,
          pubkey: alert.pubkey
        }),
      });
      
      const qrData = await qrResponse.json();
      
      // Afficher les résultats
      document.getElementById('alert-result').style.display = 'block';
      document.getElementById('alert-qr-code').src = qrData.qr;
      
      // Afficher les données techniques
      document.getElementById('alert-signature').textContent = alert.signature;
      document.getElementById('alert-pubkey').textContent = alert.pubkey;
      document.getElementById('alert-full-data').textContent = JSON.stringify({
        fullMessage: alert.fullMessage,
        signature: alert.signature,
        pubkey: alert.pubkey
      }, null, 2);
      
      // Recharger les alertes
      loadAlerts();
      showNotification('Alerte créée avec succès!');
      
    } catch (error) {
      console.error('Error:', error);
      showNotification('Erreur: ' + error.message, true);
    }
  });
  
verifyAlertManuallyBtn.addEventListener('click', async function() {
  const alertDataInput = document.getElementById('alert-data').value.trim();
  
  if (!alertDataInput) {
    showNotification('Veuillez coller les données de l\'alerte ou la signature', true);
    return;
  }

  try {
    // Afficher le statut de vérification
    document.getElementById('verification-result').style.display = 'block';
    document.getElementById('verification-status').innerHTML = 
      '<i class="fas fa-spinner fa-spin"></i> Vérification en cours...';

    // Essayer de parser les données
    let verificationData;
    
    // Essayer d'abord comme JSON complet
    try {
      const parsedData = JSON.parse(alertDataInput);
      
      if (parsedData.signature && parsedData.fullMessage && parsedData.pubkey) {
        // Cas 1: JSON complet avec toutes les propriétés
        verificationData = parsedData;
      } else if (parsedData.signature) {
        // Cas 2: Peut-être un objet avec juste la signature
        verificationData = await findAlertBySignature(parsedData.signature);
      } else {
        throw new Error('Format JSON incomplet');
      }
    } catch (e) {
      // Si le parsing JSON échoue, traiter comme une signature seule
      verificationData = await findAlertBySignature(alertDataInput);
    }

    // Vérification avec le backend
    const verificationResponse = await fetch('/api/alert/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verificationData)
    });

    if (!verificationResponse.ok) {
      throw new Error('Échec de la vérification côté serveur');
    }

    const verification = await verificationResponse.json();
    const [type, location, message, source, timestamp] = verificationData.fullMessage.split('|');

    // Afficher le résultat
    if (verification.isValid) {
      document.getElementById('verification-status').innerHTML = 
        '<i class="fas fa-check-circle success"></i> Alerte authentique';
      
      document.getElementById('verified-type').textContent = type || 'Non spécifié';
      document.getElementById('verified-location').textContent = location || 'Non spécifié';
      document.getElementById('verified-message').textContent = message || 'Non spécifié';
      document.getElementById('verified-source').textContent = source || 'Non spécifié';
      document.getElementById('verified-timestamp').textContent = timestamp ? new Date(timestamp).toLocaleString() : 'Non spécifié';
      document.getElementById('verified-signature').textContent = 'Oui (validée par LND)';
      document.getElementById('verified-hash').textContent = verificationData.signature.substring(0, 24) + '...';
      
      showNotification('Alerte vérifiée avec succès!');
    } else {
      document.getElementById('verification-status').innerHTML = 
        '<i class="fas fa-times-circle error"></i> Alerte invalide';
      showNotification('La signature ne correspond pas au message', true);
    }

  } catch (error) {
    console.error('Erreur de vérification:', error);
    document.getElementById('verification-status').innerHTML = 
      `<i class="fas fa-times-circle error"></i> Échec de vérification: ${error.message}`;
    
    // Afficher des conseils en fonction du type d'erreur
    if (error.message.includes('incomplet')) {
      showNotification(`Astuce: Vous devez fournir:
1. Soit le JSON complet (avec signature, message et clé publique)
2. Soit juste la signature (pour les alertes déjà enregistrées)`, true);
    } else {
      showNotification(`Erreur: ${error.message}`, true);
    }
  }
});

// Fonction helper pour trouver une alerte par sa signature
async function findAlertBySignature(signature) {
  try {
    const response = await fetch('/api/alerts');
    if (!response.ok) throw new Error('Impossible de charger les alertes');
    
    const alerts = await response.json();
    const foundAlert = alerts.find(a => a.signature === signature);
    
    if (!foundAlert) {
      throw new Error('Aucune alerte enregistrée ne correspond à cette signature. Essayez de fournir le JSON complet.');
    }
    
    return {
      fullMessage: foundAlert.fullMessage,
      signature: foundAlert.signature,
      pubkey: foundAlert.pubkey
    };
  } catch (error) {
    throw new Error(`Impossible de retrouver l'alerte: ${error.message}`);
  }
}

  
  
  // Scanner QR code
  startScannerBtn.addEventListener('click', startQrScanner);
  stopScannerBtn.addEventListener('click', stopQrScanner);
  
  // Télécharger QR code
  downloadQrBtn.addEventListener('click', function() {
    const qrImg = document.getElementById('alert-qr-code');
    const link = document.createElement('a');
    link.href = qrImg.src;
    link.download = 'alerte-info-relay.png';
    link.click();
    showNotification('QR Code téléchargé!');
  });
  
  // Fonctions utilitaires
  function showScreen(screen) {
    alertsScreen.classList.remove('active');
    createAlertScreen.classList.remove('active');
    verifyAlertScreen.classList.remove('active');
    
    switch(screen) {
      case 'create-alert':
        createAlertScreen.classList.add('active');
        document.getElementById('alert-result').style.display = 'none';
        document.getElementById('alert-form').reset();
        break;
      case 'verify-alert':
        verifyAlertScreen.classList.add('active');
        document.getElementById('verification-result').style.display = 'none';
        document.getElementById('alert-data').value = '';
        break;
      default:
        alertsScreen.classList.add('active');
        stopQrScanner();
        break;
    }
  }
  
  function switchTab(tabId) {
    // Désactiver tous les onglets
    tabBtns.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Activer l'onglet sélectionné
    document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`${tabId}-tab`).classList.add('active');
    
    // Si c'est l'onglet QR, démarrer le scanner
    if (tabId === 'qr' && !qrScannerActive) {
      startQrScanner();
    } else if (tabId !== 'qr') {
      stopQrScanner();
    }
  }
  
  async function loadAlerts() {
    try {
      const response = await fetch('/api/alerts');
      if (!response.ok) throw new Error('Erreur lors du chargement des alertes');
      
      const alerts = await response.json();
      renderAlerts(alerts);
    } catch (error) {
      console.error('Error:', error);
      showNotification('Erreur lors du chargement des alertes', true);
      renderAlerts([]);
    }
  }
  
  function renderAlerts(alerts) {
    const container = document.getElementById('alerts-container');
    container.innerHTML = '';
    
    if (alerts.length === 0) {
      container.innerHTML = '<p class="no-alerts">Aucune alerte disponible pour le moment</p>';
      return;
    }
    
    alerts.forEach(alert => {
      const [type, location, message, source, timestamp] = alert.fullMessage.split('|');
      
      const alertCard = document.createElement('div');
      alertCard.className = 'alert-card';
      
      // Déterminer la classe en fonction du type
      if (type.toLowerCase().includes('urgence') || type.toLowerCase().includes('incendie') || type.toLowerCase().includes('vol')) {
        alertCard.classList.add('urgent');
      } else if (type.toLowerCase().includes('avertissement') || type.toLowerCase().includes('route')) {
        alertCard.classList.add('warning');
      } else {
        alertCard.classList.add('info');
      }
      
      // Déterminer l'icône
      let icon = '⚠️';
      if (type.includes('🔥')) icon = '🔥';
      else if (type.includes('🌊')) icon = '🌊';
      else if (type.includes('🚧')) icon = '🚧';
      else if (type.includes('👮')) icon = '👮';
      else if (type.includes('📢')) icon = '📢';
      
      alertCard.innerHTML = `
        <div class="alert-header">
          <div class="alert-icon">${icon}</div>
          <div class="alert-title">${type}</div>
        </div>
        <div class="alert-body">
          <div class="alert-detail">
            <i class="fas fa-map-marker-alt"></i>
            <span>${location}</span>
          </div>
          <div class="alert-detail">
            <i class="fas fa-user-tag"></i>
            <span>${source}</span>
          </div>
          <div class="alert-detail">
            <i class="fas fa-clock"></i>
            <span>${new Date(timestamp).toLocaleString()}</span>
          </div>
          <div class="alert-detail">
            <i class="fas fa-comment-alt"></i>
            <span>${message.substring(0, 50)}${message.length > 50 ? '...' : ''}</span>
          </div>
        </div>
        <div class="alert-footer">
          <button class="btn btn-secondary view-qr" data-id="${alert.id}">
            <i class="fas fa-qrcode"></i> QR Code
          </button>
          <button class="btn btn-primary view-details" data-id="${alert.id}">
            <i class="fas fa-search"></i> Détails
          </button>
        </div>
      `;
      
      container.appendChild(alertCard);
    });
    
    // Ajouter les événements aux boutons
    document.querySelectorAll('.view-qr').forEach(btn => {
      btn.addEventListener('click', function() {
        const alertId = this.getAttribute('data-id');
        showAlertQr(alertId);
      });
    });
    
    document.querySelectorAll('.view-details').forEach(btn => {
      btn.addEventListener('click', function() {
        const alertId = this.getAttribute('data-id');
        showAlertDetails(alertId);
      });
    });
  }
  
// ... (le reste du code précédent reste identique)

async function showAlertQr(alertId) {
    try {
        const response = await fetch(`/api/alert/${alertId}`);
        if (!response.ok) throw new Error('Alerte non trouvée');
        
        const alert = await response.json();
        
        // Générer le QR code
        const qrResponse = await fetch('/api/alert/qr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                fullMessage: alert.fullMessage, 
                signature: alert.signature,
                pubkey: alert.pubkey
            }),
        });
        
        const qrData = await qrResponse.json();
        
        // Créer une modal pour afficher le QR code
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '1000';
        modal.style.backdropFilter = 'blur(5px)';
        
        modal.innerHTML = `
            <div style="background: var(--darker-color); padding: 25px; border-radius: var(--border-radius); 
                        border: 1px solid var(--primary-color); box-shadow: var(--glow); max-width: 90%; width: 400px;
                        text-align: center;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--primary-color);">
                        <i class="fas fa-qrcode"></i> QR Code de vérification
                    </h3>
                    <button id="close-qr-modal" style="background: none; border: none; color: var(--text-light); font-size: 20px; cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <img src="${qrData.qr}" style="width: 250px; height: 250px; margin: 0 auto; display: block; border: 2px solid var(--primary-color);">
                <p style="color: var(--text-light); margin-top: 20px;">Scannez ce QR code pour vérifier cette alerte</p>
                <button id="download-qr-modal" class="btn btn-primary" style="margin-top: 20px;">
                    <i class="fas fa-download"></i> Télécharger
                </button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Bouton de fermeture
        document.getElementById('close-qr-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Bouton de téléchargement
        document.getElementById('download-qr-modal').addEventListener('click', () => {
            const link = document.createElement('a');
            link.href = qrData.qr;
            link.download = `alerte-${alertId}-qr.png`;
            link.click();
            showNotification('QR Code téléchargé!');
        });
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('Erreur: ' + error.message, true);
    }
}

async function showAlertDetails(alertId) {
    try {
        const response = await fetch(`/api/alert/${alertId}`);
        if (!response.ok) throw new Error('Alerte non trouvée');
        
        const alert = await response.json();
        const [type, location, message, source, timestamp] = alert.fullMessage.split('|');
        
        // Créer une modal pour afficher les détails
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.9)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '1000';
        modal.style.backdropFilter = 'blur(5px)';
        modal.style.overflowY = 'auto';
        modal.style.padding = '20px 0';
        
        modal.innerHTML = `
            <div style="background: var(--darker-color); padding: 25px; border-radius: var(--border-radius); 
                        border: 1px solid var(--primary-color); box-shadow: var(--glow); max-width: 90%; width: 600px;
                        margin: 20px 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--primary-color);">
                        <i class="fas fa-info-circle"></i> Détails complets de l'alerte
                    </h3>
                    <button id="close-details-modal" style="background: none; border: none; color: var(--text-light); font-size: 20px; cursor: pointer;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div style="display: grid; grid-template-columns: 120px 1fr; gap: 10px; margin-bottom: 20px;">
                    <div style="color: var(--primary-color); font-weight: 500;"><i class="fas fa-tag"></i> Type:</div>
                    <div>${type}</div>
                    
                    <div style="color: var(--primary-color); font-weight: 500;"><i class="fas fa-map-marker-alt"></i> Lieu:</div>
                    <div>${location}</div>
                    
                    <div style="color: var(--primary-color); font-weight: 500;"><i class="fas fa-comment"></i> Message:</div>
                    <div>${message}</div>
                    
                    <div style="color: var(--primary-color); font-weight: 500;"><i class="fas fa-user"></i> Source:</div>
                    <div>${source}</div>
                    
                    <div style="color: var(--primary-color); font-weight: 500;"><i class="fas fa-clock"></i> Date/Heure:</div>
                    <div>${new Date(timestamp).toLocaleString()}</div>
                </div>
                
                <h4 style="color: var(--primary-color); margin-top: 25px; border-bottom: 1px solid var(--gray-color); padding-bottom: 8px;">
                    <i class="fas fa-code"></i> Données techniques
                </h4>
                
                <div style="margin-bottom: 15px;">
                    <div style="color: var(--primary-color); margin-bottom: 5px;">
                        <i class="fas fa-signature"></i> Signature:
                    </div>
                    <textarea style="width: 100%; height: 80px; padding: 10px; background: var(--dark-color); 
                                color: var(--text-color); border: 1px solid var(--gray-color); border-radius: 4px; 
                                font-family: monospace; resize: none;" readonly>${alert.signature}</textarea>
                    <button class="btn btn-secondary btn-copy" data-text="${alert.signature}" style="margin-top: 5px;">
                        <i class="fas fa-copy"></i> Copier la signature
                    </button>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div style="color: var(--primary-color); margin-bottom: 5px;">
                        <i class="fas fa-key"></i> Clé publique:
                    </div>
                    <textarea style="width: 100%; height: 80px; padding: 10px; background: var(--dark-color); 
                                color: var(--text-color); border: 1px solid var(--gray-color); border-radius: 4px; 
                                font-family: monospace; resize: none;" readonly>${alert.pubkey}</textarea>
                    <button class="btn btn-secondary btn-copy" data-text="${alert.pubkey}" style="margin-top: 5px;">
                        <i class="fas fa-copy"></i> Copier la clé publique
                    </button>
                </div>
                
                <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                    <button id="view-qr-from-details" class="btn btn-primary">
                        <i class="fas fa-qrcode"></i> Voir QR Code
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Gestion des boutons de copie
        modal.querySelectorAll('.btn-copy').forEach(btn => {
            btn.addEventListener('click', function() {
                const textToCopy = this.getAttribute('data-text');
                navigator.clipboard.writeText(textToCopy).then(() => {
                    showNotification('Texte copié dans le presse-papier!');
                }).catch(err => {
                    showNotification('Erreur lors de la copie', true);
                    console.error('Erreur de copie:', err);
                });
            });
        });
        
        // Bouton de fermeture
        document.getElementById('close-details-modal').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Bouton pour voir le QR code
        document.getElementById('view-qr-from-details').addEventListener('click', () => {
            document.body.removeChild(modal);
            showAlertQr(alertId);
        });
        
    } catch (error) {
        console.error('Error:', error);
        showNotification('Erreur: ' + error.message, true);
    }
}

  
  function startQrScanner() {
    const video = document.getElementById('qr-video');
    const canvas = document.getElementById('qr-canvas');
    const placeholder = document.querySelector('.qr-placeholder');
    
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(function(stream) {
        videoStream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', true);
        video.play();
        
        startScannerBtn.style.display = 'none';
        stopScannerBtn.style.display = 'inline-block';
        placeholder.style.display = 'none';
        video.style.display = 'block';
        
        qrScannerActive = true;
        requestAnimationFrame(tick);
      })
      .catch(function(err) {
        console.error('Error accessing camera:', err);
        showNotification('Impossible d\'accéder à la caméra: ' + err.message, true);
      });
    
    function tick() {
      if (!qrScannerActive) return;
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        
        if (code) {
          try {
            const alertData = JSON.parse(code.data);
            document.getElementById('alert-data').value = JSON.stringify(alertData, null, 2);
            stopQrScanner();
            document.getElementById('verify-alert-manually').click();
          } catch (e) {
            console.error('Error parsing QR code:', e);
          }
        }
      }
      
      requestAnimationFrame(tick);
    }
  }
  
  function stopQrScanner() {
    if (!qrScannerActive) return;
    
    qrScannerActive = false;
    const video = document.getElementById('qr-video');
    const placeholder = document.querySelector('.qr-placeholder');
    
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
    }
    
    startScannerBtn.style.display = 'inline-block';
    stopScannerBtn.style.display = 'none';
    placeholder.style.display = 'block';
    video.style.display = 'none';
  }
  
  // Mettre à jour l'horodatage dans le formulaire
  function updateTimestamp() {
    document.getElementById('alert-timestamp').value = new Date().toLocaleString();
  }
  
  setInterval(updateTimestamp, 1000);
  updateTimestamp();


  // Ajoutez ce code dans votre DOMContentLoaded

// Élément du filtre
const alertFilter = document.getElementById('alert-filter');

// Fonction de filtrage
function filterAlerts(type) {
  const alertCards = document.querySelectorAll('.alert-card');
  
  alertCards.forEach(card => {
    const isUrgent = card.classList.contains('urgent');
    const isWarning = card.classList.contains('warning');
    const isInfo = card.classList.contains('info');
    
    switch(type) {
      case 'urgent':
        card.style.display = isUrgent ? 'block' : 'none';
        break;
      case 'warning':
        card.style.display = isWarning ? 'block' : 'none';
        break;
      case 'info':
        card.style.display = isInfo ? 'block' : 'none';
        break;
      default:
        card.style.display = 'block';
    }
  });
}

// Écouteur d'événement pour le filtre
alertFilter.addEventListener('change', (e) => {
  filterAlerts(e.target.value);
});

// Initialisation
filterAlerts('all');
});