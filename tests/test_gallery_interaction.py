"""Test the interactive Matisse gallery painting viewer in the resort map."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tests'))

from resort_harness import resort_page, check

with resort_page() as (page, errors):
    page.evaluate('async () => { await window.__resort.galleryReady; }')
    
    # 1. Verify DOM elements and module initialization
    init_state = page.evaluate('''() => {
        const v = window.__resort;
        const prompt = document.getElementById('artPrompt');
        const modal = document.getElementById('artModal');
        const works = v.props.gallery.artworks;
        return {
            hasPrompt: !!prompt,
            hasModal: !!modal,
            hasInteraction: !!v.galleryInteraction,
            worksCount: works ? works.length : 0,
            artPromptHidden: prompt ? prompt.hidden : null,
            modalOpen: modal ? modal.classList.contains('art-modal--open') : null
        };
    }''')
    print("Init state:", init_state)
    check("artPrompt DOM exists", init_state["hasPrompt"])
    check("artModal DOM exists", init_state["hasModal"])
    check("galleryInteraction initialized", init_state["hasInteraction"])
    check("6 or 7 artworks loaded", init_state["worksCount"] >= 6)
    check("modal starts closed", not init_state["modalOpen"])

    # 2. Position player/camera inside the gallery facing an artwork
    target_info = page.evaluate('''() => {
        const v = window.__resort;
        const art = v.props.gallery.artworks[0];
        // Stand 2.5m in front of the artwork facing it
        const normal = art.normal;
        const camPos = art.centre.clone().addScaledVector(normal, 2.5);
        camPos.y = art.centre.y; // eye level with painting centre
        v.camera.position.copy(camPos);
        v.camera.lookAt(art.centre);
        v.camera.updateMatrixWorld(true);
        v.ctrl.pos.copy(camPos);
        
        // Update frame
        v.galleryInteraction.update(v.camera);
        
        const prompt = document.getElementById('artPrompt');
        const titleEl = document.getElementById('artPromptTitle');
        return {
            artTitle: art.work.title,
            promptHidden: prompt.hidden,
            promptTitle: titleEl ? titleEl.textContent : ''
        };
    }''')
    print("Facing painting:", target_info)
    check("artPrompt visible when looking at painting", not target_info["promptHidden"])
    check("artPrompt title matches artwork", target_info["promptTitle"] == target_info["artTitle"])

    # 3. Open modal via keyboard [KeyE]
    page.keyboard.press('KeyE')
    page.wait_for_timeout(300)
    modal_opened = page.evaluate('''() => {
        const modal = document.getElementById('artModal');
        const img = document.getElementById('artModalImg');
        const title = document.getElementById('artModalTitle');
        const v = window.__resort;
        return {
            isOpen: v.galleryInteraction.isOpen,
            modalHasClass: modal.classList.contains('art-modal--open'),
            imgSrc: img.src,
            title: title.textContent
        };
    }''')
    print("Modal opened via [KeyE]:", modal_opened)
    check("galleryInteraction.isOpen is true", modal_opened["isOpen"])
    check("modal has .art-modal--open class", modal_opened["modalHasClass"])
    check("modal image loaded HD texture", "textures/resort-matisse/" in modal_opened["imgSrc"])

    # 4. Close modal via Escape key
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)
    modal_closed_esc = page.evaluate('''() => {
        const modal = document.getElementById('artModal');
        const v = window.__resort;
        return {
            isOpen: v.galleryInteraction.isOpen,
            modalHasClass: modal.classList.contains('art-modal--open')
        };
    }''')
    print("Modal closed via Escape:", modal_closed_esc)
    check("galleryInteraction.isOpen false after Escape", not modal_closed_esc["isOpen"])
    check("modal class removed after Escape", not modal_closed_esc["modalHasClass"])

    # 5. Open modal again by clicking the prompt button
    page.evaluate('''() => {
        const prompt = document.getElementById('artPrompt');
        prompt.click();
    }''')
    page.wait_for_timeout(300)
    modal_opened_prompt = page.evaluate('() => window.__resort.galleryInteraction.isOpen')
    check("modal opened via prompt click", modal_opened_prompt)

    # 6. Close modal by clicking the close cross button
    page.evaluate('''() => {
        const closeBtn = document.getElementById('artModalClose');
        closeBtn.click();
    }''')
    page.wait_for_timeout(300)
    modal_closed_btn = page.evaluate('() => window.__resort.galleryInteraction.isOpen')
    check("modal closed via close button", not modal_closed_btn)

    # 6b. Open modal via direct Left Click anywhere on screen (mouse click while aiming)
    page.mouse.click(480, 270)
    page.wait_for_timeout(300)
    modal_opened_click = page.evaluate('() => window.__resort.galleryInteraction.isOpen')
    check("modal opened via direct left click", modal_opened_click)
    page.keyboard.press('Escape')
    page.wait_for_timeout(300)

    # 7. Check look-away: prompt hides when looking away (e.g. down at floor)
    look_away = page.evaluate('''() => {
        const v = window.__resort;
        // Look down at the floor
        v.camera.lookAt(v.camera.position.x, 0, v.camera.position.z);
        v.camera.updateMatrixWorld(true);
        v.galleryInteraction.update(v.camera);
        const prompt = document.getElementById('artPrompt');
        return {
            promptHidden: prompt.hidden,
            currentTarget: v.galleryInteraction.currentTarget
        };
    }''')
    print("Look away (down at floor):", look_away)
    check("prompt hidden when looking away", look_away["promptHidden"])

    print("\nALL GALLERY INTERACTION TESTS PASSED!")
