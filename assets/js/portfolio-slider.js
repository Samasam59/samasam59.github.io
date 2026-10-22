/* Swiper Element is loaded by al_img_tools only on pages with images.slider. */
customElements.whenDefined("swiper-container").then(() => {
  document.querySelectorAll("[data-slider]").forEach((root) => {
    const container = root.querySelector("swiper-container");
    const pagination = root.querySelector(".portfolio-slider__pagination");
    const dots = [...pagination.querySelectorAll("button")];
    const status = root.querySelector(".portfolio-slider__status");
    const motionNote = root.querySelector("[data-slider-motion-note]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let playing = !reducedMotion.matches;
    let hovering = false;

    Object.assign(container, {
      slidesPerView: 1,
      loop: true,
      speed: reducedMotion.matches ? 0 : 500,
      effect: "slide",
      autoplay: { enabled: false, delay: 5000, disableOnInteraction: true },
      a11y: {
        enabled: true,
        itemRoleDescriptionMessage: "diapositive",
        slideLabelMessage: "{{index}} sur {{slidesLength}}",
        // Announcements are handled below, only when automatic playback stops.
        wrapperLiveRegion: false,
      },
    });
    // Make all slides measurable before Swiper calculates its loop.
    root.setAttribute("data-ready", "");
    container.initialize();
    const swiper = container.swiper;

    function updateSlide() {
      const index = swiper.realIndex;
      dots.forEach((dot, i) => {
        if (i === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
      swiper.slides.forEach((slide) => {
        slide.setAttribute("aria-hidden", String(slide !== swiper.slides[swiper.activeIndex]));
      });
      status.textContent = dots[index].getAttribute("aria-label");
    }

    function syncPlayback() {
      const running = playing && !hovering && !document.hidden && !reducedMotion.matches;
      if (running && !swiper.autoplay.running) swiper.autoplay.start();
      if (!running && swiper.autoplay.running) swiper.autoplay.stop();
      motionNote.hidden = !reducedMotion.matches;
      status.setAttribute("aria-live", running ? "off" : "polite");
    }

    function pause() {
      playing = false;
      syncPlayback();
    }

    // Hover pauses temporarily; manual navigation/focus stops playback until the page is reloaded.
    root.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      hovering = true;
      syncPlayback();
    });
    root.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      hovering = false;
      syncPlayback();
    });
    root.addEventListener("focusin", (event) => {
      if (!root.contains(event.relatedTarget)) pause();
    });
    dots.forEach((dot, index) => {
      dot.addEventListener("click", () => {
        pause();
        swiper.slideToLoop(index);
      });
    });
    root.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      pause();
      if (event.key === "ArrowLeft") swiper.slidePrev();
      if (event.key === "ArrowRight") swiper.slideNext();
      if (event.key === "Home") swiper.slideToLoop(0);
      if (event.key === "End") swiper.slideToLoop(dots.length - 1);
    });
    container.addEventListener("pointerdown", pause);
    swiper.on("sliderFirstMove", pause);
    swiper.on("slideChange", updateSlide);
    document.addEventListener("visibilitychange", syncPlayback);
    reducedMotion.addEventListener("change", () => {
      swiper.params.speed = reducedMotion.matches ? 0 : 500;
      // Changing the OS preference never silently restarts a paused carousel.
      pause();
    });

    pagination.hidden = false;
    updateSlide();
    syncPlayback();
  });
});
