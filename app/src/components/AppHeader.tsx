            <span className="app-brand-mark">
              <PlaneTakeoff size={19} strokeWidth={2.2} />
            </span>
            <span>
              DIRECT<span className="app-brand-period">.</span>
            </span>
          </Link>
          <button
            type="button"
            className="app-mobile-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="app-workspace">
          <span className="app-workspace-icon">D</span>
          <span>Travel workspace</span>
          <span className="app-workspace-dot" />
        </div>

        <p className="app-nav-label">Workspace</p>
        <nav className="app-nav" aria-label="Main navigation">
          {WORKSPACE_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="app-nav-link"
              activeOptions={{ exact: true }}
              activeProps={{ className: "app-nav-link is-active" }}
              onClick={() => setOpen(false)}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <p className="app-nav-label app-nav-label-spaced">Your account</p>
        <nav className="app-nav" aria-label="Personal navigation">
          <Link
            to="/profile"
            className="app-nav-link"
            activeProps={{ className: "app-nav-link is-active" }}
            onClick={() => setOpen(false)}
          >
            <Users size={17} />
            <span>Travel preferences</span>
          </Link>
        </nav>

        <div className="app-sidebar-spacer" />
        <div className="app-sidebar-tip">
          <span className="app-tip-icon">
            <Lightbulb size={16} />
          </span>
          <p>Find a place worth remembering.</p>
          <Link to="/ideas" onClick={() => setOpen(false)}>
            Explore destinations <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="app-sidebar-footer">
          <span className="app-avatar">
            {(profile?.display_name || "T").slice(0, 1).toUpperCase()}
          </span>
          <span className="app-user-copy">
            <strong>{profile?.display_name || "Traveler"}</strong>
            <span>{profile?.home_city || "Travel enthusiast"}</span>
          </span>
          <button
            className="app-signout"
            type="button"
            aria-label="Sign out"
            onClick={() => void signOut()}
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <header className="app-topbar">
        <button
          className="app-mobile-menu"
          type="button"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
        >
          <Menu size={19} />
        </button>
        <div className="app-breadcrumb">
          <span>Workspace</span>
          <span aria-hidden="true">/</span>
          <strong>{pageLabel}</strong>
        </div>
        <div className="app-topbar-actions">
          <Link to="/trips" className="app-search">
            <Search size={15} />
            <span>Find a trip</span>
            <kbd>/</kbd>
          </Link>
          <span className="app-topbar-divider" />
          <span className="app-date">
            <CalendarDays size={14} />
            {new Intl.DateTimeFormat("en", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).format(new Date())}
          </span>
          <span className="app-avatar app-avatar-small">
            {(profile?.display_name || "T").slice(0, 1).toUpperCase()}
          </span>
        </div>
      </header>
    </>
  );
}
