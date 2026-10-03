"""The village must start with an empty or implemented optional gallery module."""
from resort_harness import resort_page, check

with resort_page() as (page, errors):
    page.evaluate('async()=>{await window.__resort.galleryReady;}')
    check('village and seven Matisse works loaded', page.evaluate(
        'window.__resort.props.gallery.artworks.length===7'))
    page.evaluate('window.__startResort();window.__testAnimate();')
    check('start renders a frame and hides the welcome screen', page.evaluate('''()=>{
      const v=window.__resort;
      return document.getElementById('overlay').style.display==='none'&&v.renderer.info.render.calls>0;
    }'''))

# Exercise both module states before imports resolve, independently of its WIP contents.
for source, enabled in [('', False), ('''export function createGalleryInteraction(){
    window.__galleryUpdates=0;
    return {isOpen:false,currentTarget:null,
      update(){window.__galleryUpdates++;return false;},
      dispose(){window.__galleryDisposed=true;}};
}''', True)]:
    with resort_page(url='index.html?map=resort&arrival=jungle') as (page, errors):
        page.route('**/resortGalleryInteraction.js*', lambda route, _request, body=source:
                   route.fulfill(body=body, content_type='text/javascript'))
        page.reload()
        page.wait_for_function('window.__resort && window.__resort.ctrl', timeout=180000)
        page.evaluate('async()=>{await window.__resort.galleryReady;await window.__resort.playerReady;}')
        check('optional interaction enabled' if enabled else 'empty module permits startup',
              page.evaluate('window.__resort.galleryInteraction!==null') == enabled)
        page.evaluate('window.__testAnimate();')
        check('scene renders with optional module state', page.evaluate(
            'window.__resort.renderer.info.render.calls>0'))
        if enabled:
            check('implemented interaction receives updates', page.evaluate('window.__galleryUpdates>0'))
        page.evaluate('window.__resort.dispose()')
        if enabled:
            check('implemented interaction disposed', page.evaluate('window.__galleryDisposed===true'))
