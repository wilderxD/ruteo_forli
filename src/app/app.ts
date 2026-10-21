import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CargaOverlayComponent } from './shared/components/carga-overlay/carga-overlay.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CargaOverlayComponent],
  template: `<router-outlet /><app-carga-overlay />`,
  styleUrl: './app.scss'
})
export class App {}
