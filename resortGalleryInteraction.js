import * as THREE from 'three';

// Interaction pour la galerie Matisse :
// 1. Détection via Raycaster et proximité orientée face aux toiles (Mesh).
// 2. Invite HUD discrète superposée au canevas ("Appuyez pour zoomer" / [E] / [Clic gauche]).
// 3. Libération du pointer lock à l'apparition de l'invite pour figer la caméra et
//    libérer la souris afin de pouvoir cliquer sur le bouton ou la toile (comme sur les autres maps).
// 4. Modale plein écran avec reproduction HD, métadonnées complètes, fond sombre et transition douce.
// 5. Fermeture par la croix ou touche Échap avec réactivation immédiate des contrôles et du verrouillage.

const CSS = `
/* --- Prompt HUD discret --- */
.art-prompt {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%) translateY(10px);
  background: rgba(14, 18, 24, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(216, 176, 96, 0.6);
  border-radius: 8px;
  padding: 10px 18px;
  color: #f5eedb;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55), 0 0 16px rgba(216, 176, 96, 0.25);
  z-index: 1000;
  pointer-events: auto;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s, border-color 0.2s;
  user-select: none;
}
.art-prompt[hidden] { display: none; pointer-events: none; }
.art-prompt:not([hidden]) {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.art-prompt:hover {
  background: rgba(24, 30, 42, 0.98);
  border-color: rgba(235, 195, 115, 0.95);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.65), 0 0 22px rgba(216, 176, 96, 0.45);
}
.art-prompt-icon {
  font-size: 1.25rem;
  line-height: 1;
  filter: drop-shadow(0 0 4px rgba(216, 176, 96, 0.6));
}
.art-prompt-body {
  display: flex;
  flex-direction: column;
  text-align: left;
  gap: 3px;
}
.art-prompt-title {
  font-family: Georgia, serif;
  font-size: 0.96rem;
  font-weight: 600;
  color: #fff4d9;
}
.art-prompt-keys {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: #baa888;
}
.art-prompt-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(216, 176, 96, 0.22);
  border: 1px solid rgba(216, 176, 96, 0.7);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  color: #fff8e7;
  letter-spacing: 0.02em;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.art-prompt-sep {
  font-size: 0.72rem;
  color: #8c7e68;
}
.art-prompt-action {
  font-size: 0.76rem;
  color: #cbb898;
}

/* --- Modale Plein Écran --- */
.art-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease;
  user-select: none;
}
.art-modal.art-modal--open {
  opacity: 1;
  pointer-events: auto;
}
.art-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(8, 10, 14, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.art-modal-container {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 92vw;
  max-height: 92vh;
  padding: 20px;
  transform: scale(0.94);
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.art-modal.art-modal--open .art-modal-container {
  transform: scale(1);
}
.art-modal-close {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 44px;
  height: 44px;
  background: rgba(26, 32, 42, 0.85);
  border: 1px solid rgba(216, 176, 96, 0.4);
  color: #ecd9ba;
  font-size: 28px;
  line-height: 1;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s, transform 0.2s, border-color 0.2s;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}
.art-modal-close:hover {
  background: rgba(216, 176, 96, 0.95);
  color: #12151b;
  border-color: #ffd88a;
  transform: rotate(90deg) scale(1.08);
}
.art-modal-figure {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-height: 84vh;
  margin: 0;
}
.art-modal-image {
  max-width: 86vw;
  max-height: 72vh;
  object-fit: contain;
  border: 4px solid #1a1612;
  outline: 1px solid rgba(216, 176, 96, 0.5);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(216, 176, 96, 0.15);
  border-radius: 2px;
  background: #0d0f12;
}
.art-modal-caption {
  margin-top: 14px;
  text-align: center;
  color: #ecd9ba;
  max-width: 680px;
}
.art-modal-title {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.35rem;
  font-weight: 500;
  margin: 0 0 4px 0;
  color: #fff2d6;
  letter-spacing: 0.02em;
}
.art-modal-details {
  font-size: 0.88rem;
  color: #d1ba95;
  margin: 0 0 4px 0;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.art-modal-museum {
  font-size: 0.82rem;
  color: #9c8e76;
  font-style: italic;
  margin: 0;
}
`;

export function createGalleryInteraction({ scene, camera, renderer, gallery, input, ctrl, controls }) {
  // 1. Injection du style CSS
  const style = document.createElement('style');
  style.id = 'gallery-interaction-styles';
  style.textContent = CSS;
  document.head.appendChild(style);

  // 2. Construction des éléments DOM
  let promptEl = document.getElementById('artPrompt');
  if (!promptEl) {
    promptEl = document.createElement('div');
    promptEl.id = 'artPrompt';
    promptEl.className = 'art-prompt';
    promptEl.hidden = true;
    promptEl.innerHTML = `
      <span class="art-prompt-icon">🔍</span>
      <div class="art-prompt-body">
        <span class="art-prompt-title" id="artPromptTitle">Tableau</span>
        <span class="art-prompt-keys">
          <kbd class="art-prompt-kbd">E</kbd>
          <span class="art-prompt-sep">ou</span>
          <kbd class="art-prompt-kbd">Clic gauche</kbd>
          <span class="art-prompt-action">pour zoomer</span>
        </span>
      </div>
    `;
    document.body.appendChild(promptEl);
  }

  let modalEl = document.getElementById('artModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'artModal';
    modalEl.className = 'art-modal';
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.innerHTML = `
      <div class="art-modal-backdrop" id="artModalBackdrop"></div>
      <div class="art-modal-container">
        <button class="art-modal-close" id="artModalClose" aria-label="Fermer (Échap)">&times;</button>
        <figure class="art-modal-figure">
          <img id="artModalImg" class="art-modal-image" src="" alt="Peinture" />
          <figcaption class="art-modal-caption">
            <h2 id="artModalTitle" class="art-modal-title"></h2>
            <p id="artModalDetails" class="art-modal-details"></p>
            <p id="artModalMuseum" class="art-modal-museum"></p>
          </figcaption>
        </figure>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  const imgEl = modalEl.querySelector('#artModalImg');
  const titleEl = modalEl.querySelector('#artModalTitle');
  const detailsEl = modalEl.querySelector('#artModalDetails');
  const museumEl = modalEl.querySelector('#artModalMuseum');
  const promptTitleEl = promptEl.querySelector('#artPromptTitle');

  // 3. Configuration des cibles de détection
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const camDir = new THREE.Vector3();
  const toArt = new THREE.Vector3();
  let hitMeshes = [];
  let currentTarget = null;
  let isOpen = false;
  let hasPrompt = false;
  let cooldownUntil = 0;

  function initHitTargets() {
    if (!gallery?.artworks?.length) return;
    hitMeshes.forEach(m => {
      m.geometry.dispose();
      m.material.dispose();
      scene.remove(m);
    });
    hitMeshes = [];

    gallery.artworks.forEach(art => {
      const geo = new THREE.PlaneGeometry(art.width, art.height);
      const mat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `art-hit:${art.work.id}`;
      // Décalage de 2 cm vers l'avant selon la normale pour garantir l'absence d'occlusion
      mesh.position.copy(art.centre).addScaledVector(art.normal, 0.02);
      const rotY = Math.atan2(art.normal.x, art.normal.z);
      mesh.rotation.y = rotY;
      mesh.userData = { artwork: art };
      scene.add(mesh);
      mesh.updateMatrixWorld(true);
      hitMeshes.push(mesh);
    });
  }

  if (gallery?.artworks?.length) {
    initHitTargets();
  } else if (gallery?.ready) {
    gallery.ready.then(initHitTargets).catch(() => {});
  }

  // Vérifie si le joueur est toujours en position d'interagir avec cette œuvre
  // (permet l'hystérésis pour que le bouton ne disparaisse pas quand on déplace la souris dessus)
  function isTargetValid(art, activeCam) {
    if (!art) return false;
    const playerPos = ctrl?.pos || activeCam.position;
    const dist = Math.hypot(playerPos.x - art.centre.x, playerPos.z - art.centre.z);
    if (dist > 5.2) return false; // Trop loin (le joueur s'est éloigné avec WASD)

    // Vérifier que le joueur est du bon côté du mur (face avant)
    toArt.set(playerPos.x - art.centre.x, 0, playerPos.z - art.centre.z);
    if (toArt.dot(art.normal) < 0.05) return false;

    // Vérifier l'orientation de la caméra
    activeCam.getWorldDirection(camDir);
    // Face au mur : camDir.dot(art.normal) < 0. Si > 0.35, la caméra tourne le dos au tableau
    if (camDir.dot(art.normal) > 0.35) return false;

    // Si on regarde droit vers le sol (pitch extrême vers le bas)
    if (camDir.y < -0.8) return false;

    return true;
  }

  function setPrompt(target) {
    if (target) {
      currentTarget = target;
      promptTitleEl.textContent = target.work.title || 'Tableau';
      promptEl.hidden = false;
      if (!hasPrompt && !isOpen) {
        hasPrompt = true;
        // Comme dans les autres maps : l'invite libère le pointeur pour que la souris
        // cesse de faire tourner la caméra et redevienne un curseur libre pour cliquer
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
      }
    } else {
      if (hasPrompt && !isOpen) {
        hasPrompt = false;
        currentTarget = null;
        promptEl.hidden = true;
        // En s'éloignant ou en tournant le dos, la capture de la souris reprend automatiquement
        try {
          renderer?.domElement?.requestPointerLock?.()?.catch?.(() => {});
        } catch (_) {}
      }
    }
  }

  function dismissPrompt() {
    if (hasPrompt && !isOpen) {
      setPrompt(null);
    }
  }

  // 4. Ouverture et fermeture de la modale
  function open(artwork) {
    if (!artwork?.work) return;
    isOpen = true;
    currentTarget = artwork;

    if (controls) controls.enabled = false;
    input?.keys?.clear?.();

    const work = artwork.work;
    const hdUrl = new URL(`./textures/resort-matisse/${work.file}`, import.meta.url).href;
    imgEl.src = hdUrl;
    imgEl.alt = work.title || 'Tableau';
    titleEl.textContent = work.title || 'Sans titre';
    detailsEl.textContent = `${work.artist || 'Henri Matisse'} · ${work.date || ''}`;
    museumEl.textContent = work.museum || '';

    modalEl.classList.add('art-modal--open');
    modalEl.setAttribute('aria-hidden', 'false');
    promptEl.hidden = true;

    // Libérer le pointer lock pour permettre le clic souris sur l'interface
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    modalEl.classList.remove('art-modal--open');
    modalEl.setAttribute('aria-hidden', 'true');
    imgEl.src = '';
    cooldownUntil = performance.now() + 80;

    if (controls) controls.enabled = true;
    input?.keys?.clear?.();

    if (currentTarget) {
      setPrompt(currentTarget);
    } else {
      hasPrompt = false;
      try {
        renderer?.domElement?.requestPointerLock?.()?.catch?.(() => {});
      } catch (_) {}
    }
  }

  // 5. Gestion des événements utilisateur
  modalEl.querySelector('#artModalClose').addEventListener('click', e => {
    e.stopPropagation();
    close();
  });
  modalEl.querySelector('#artModalBackdrop').addEventListener('click', close);

  promptEl.addEventListener('click', e => {
    e.stopPropagation();
    if (currentTarget) open(currentTarget);
  });

  // Clic sur le canvas quand un tableau est visé
  renderer.domElement.addEventListener('click', () => {
    if (isOpen || performance.now() < cooldownUntil) return;
    if (currentTarget) {
      open(currentTarget);
    }
  });

  // Clic gauche immédiat sur la fenêtre (si une œuvre est visée)
  window.addEventListener('mousedown', e => {
    if (isOpen || !currentTarget || performance.now() < cooldownUntil) return;
    if (e.button === 0) { // Clic gauche
      // Si le clic vise un bouton UI comme le contrôleur de temps, laisser passer
      if (e.target?.closest?.('#resortTimeControls, #overlay, #startBtn')) return;
      e.preventDefault();
      e.stopPropagation();
      open(currentTarget);
    }
  }, true);

  // Clavier : E ou Entrée pour ouvrir, Échap pour fermer
  window.addEventListener('keydown', e => {
    if (isOpen) {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
      return;
    }
    if (currentTarget && (e.code === 'KeyE' || e.code === 'Enter')) {
      e.preventDefault();
      open(currentTarget);
    }
  }, true);

  // Détection du survol souris
  let mouseMovePos = new THREE.Vector2();
  let hasMovedMouse = false;
  window.addEventListener('mousemove', e => {
    if (isOpen) return;
    hasMovedMouse = true;
    const rect = renderer.domElement.getBoundingClientRect();
    mouseMovePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseMovePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });

  function checkHits(ray) {
    const hits = ray.intersectObjects(hitMeshes, false);
    for (const hit of hits) {
      const art = hit.object.userData.artwork;
      const distOk = ctrl?.pos
        ? Math.hypot(ctrl.pos.x - art.centre.x, ctrl.pos.z - art.centre.z) < 6.5
        : hit.distance < 11.0;

      if (distOk && hit.distance < 12.0 && ray.ray.direction.dot(art.normal) < -0.15) {
        return art;
      }
    }
    return null;
  }

  // 6. Boucle de mise à jour à chaque frame
  function update(cameraParam) {
    if (isOpen) return true; // Bloque la navigation de fond pendant la modale
    if (!hitMeshes.length || performance.now() < cooldownUntil) return false;

    const activeCam = cameraParam || camera;
    activeCam.updateMatrixWorld();

    // 1. Visée centrale principale (réticule)
    pointer.set(0, 0);
    raycaster.setFromCamera(pointer, activeCam);
    let found = checkHits(raycaster);

    // 2. Survol libre avec le curseur souris
    if (!found && !document.pointerLockElement && hasMovedMouse) {
      pointer.copy(mouseMovePos);
      raycaster.setFromCamera(pointer, activeCam);
      found = checkHits(raycaster);
    }

    // 3. Hystérésis & persistance : si on a déjà une cible en cours et que le joueur
    // reste devant sans s'être éloigné avec WASD, garder la cible active même quand
    // la souris se déplace vers le bas de l'écran pour cliquer sur le bouton HUD !
    if (!found && currentTarget && isTargetValid(currentTarget, activeCam)) {
      found = currentTarget;
    }

    // 4. Proximité de secours : si le joueur est proche (< 3.8m) et fait face à la toile
    if (!found) {
      const playerPos = ctrl?.pos || activeCam.position;
      activeCam.getWorldDirection(camDir);
      let bestArt = null;
      let bestDist = Infinity;
      if (gallery?.artworks) {
        for (const art of gallery.artworks) {
          if (!isTargetValid(art, activeCam)) continue;
          const d = Math.hypot(playerPos.x - art.centre.x, playerPos.z - art.centre.z);
          const faceDot = -(camDir.x * art.normal.x + camDir.z * art.normal.z);
          if (d < 3.8 && faceDot > 0.45 && d < bestDist) {
            bestDist = d;
            bestArt = art;
          }
        }
      }
      if (bestArt) found = bestArt;
    }

    setPrompt(found);
    return false;
  }

  return {
    update,
    open,
    close,
    dismissPrompt,
    get isOpen() { return isOpen; },
    get hasPrompt() { return hasPrompt; },
    get currentTarget() { return currentTarget; },
    dispose() {
      style.remove();
      promptEl.remove();
      modalEl.remove();
      hitMeshes.forEach(m => {
        m.geometry.dispose();
        m.material.dispose();
        scene.remove(m);
      });
    }
  };
}
