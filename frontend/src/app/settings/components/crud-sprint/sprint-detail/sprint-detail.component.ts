import { ActivatedRoute } from '@angular/router';
import { Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer } from '@angular/platform-browser';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';

// Angular Material
import { MatDialog } from '@angular/material/dialog';
import { MatIconRegistry } from '@angular/material/icon';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';

// Third-party
import { delay, map, Observable, of, startWith, Subject, switchMap, takeUntil } from 'rxjs';

// Local
import { Squad } from 'src/app/settings/interfaces/squad';
import { rippleColor } from 'src/app/utils/constants/ripple-color';
import { SquadService } from 'src/app/squad/services/squad.service';
import { SprintService } from 'src/app/sprint/services/sprint.service';
import { SprintSetting } from 'src/app/settings/interfaces/sprint-setting';
import { ConfirmationDialog } from 'src/app/utils/interfaces/confirmation-dialog';
import { SnackbarHandlerService } from 'src/app/utils/services/snackbar-handler.service';
import { SprintSettingsService } from 'src/app/settings/services/sprint-settings.service';
import { ConfirmationDialogComponent } from 'src/app/utils/components/confirmation-dialog/confirmation-dialog.component';


@Component({
  selector: 'app-sprint-detail',
  templateUrl: './sprint-detail.component.html',
  styleUrls: ['./sprint-detail.component.scss']
})
export class SprintDetailComponent implements OnInit {

  icon: string;
  form: FormGroup;
  update!: boolean;
  subtitle!: string;
  rippleColor!: string
  squads$!: Observable<Squad[]>;
  filteredSquads$!: Observable<Squad[]>;
  sprintSettings$!: Observable<SprintSetting[]>;

  private _isDestroyed$: Subject<void>;
  private _dialogSubscription$: Subject<void>;
  private _snackbarSubscription$: Subject<void>;
  private _sprintChangeSubscription$: Subject<void>;

  constructor(
    private _dialog: MatDialog,
    private _sanitizer: DomSanitizer,
    private _formBuilder: FormBuilder,
    private _squadService: SquadService,
    private _sprintService: SprintService,
    private _iconRegistry: MatIconRegistry,
    private _activatedRoute: ActivatedRoute,
    private _sprintSettingsService: SprintSettingsService,
    private _snackBarHandlerService: SnackbarHandlerService
  ) {

    this.form = this._formBuilder.group({
      id: [null, []],
      name: [null, [Validators.required]],
      sprintConfigurationId: [null, [Validators.required]],
      startDate: [undefined, []],
      endDate: [undefined, []],
      squads: [[], []],
      squad: [null, []],
    });

    this._sanitizeIcons();
    this.icon = 'add';
    this.rippleColor = rippleColor;
    this._isDestroyed$ = new Subject();
    this._dialogSubscription$ = new Subject();
    this._snackbarSubscription$ = new Subject();
    this._sprintChangeSubscription$ = new Subject();
  }

  private _sanitizeIcons(): void {
    this._iconRegistry.addSvgIcon('add', this._sanitizer.bypassSecurityTrustResourceUrl('assets/icons/add.svg'));
    this._iconRegistry.addSvgIcon('edit', this._sanitizer.bypassSecurityTrustResourceUrl('assets/icons/edit.svg'));
    this._iconRegistry.addSvgIcon('cancel', this._sanitizer.bypassSecurityTrustResourceUrl('assets/icons/cancel_outline.svg'));
  }

  private _filterSquads(squadName: string): Observable<Squad[]> {
    const _squadName = squadName.toLocaleLowerCase();
    return this.squads$.pipe(
      map((squads: Squad[]) => {
        return squads.filter((squad: Squad) => squad.name.toLocaleLowerCase().includes(_squadName));
      })
    );
  }

  private _onRequestError(error: HttpErrorResponse): void {
    let message: string;
    message = (error.status === 404) ? 'Oops! Sprint não encontrada' : 'Ooops! Houve um erro desconhecido';

    this._snackBarHandlerService.openSnackBar(
      this._snackbarSubscription$,
      message,
      'OK',
      ['settings', 'new', 'sprint']
    );
  }

  private _onRequestSuccess(message: string, navigateTo?: string[]): void {
    this._snackBarHandlerService.openSnackBar(
      this._snackbarSubscription$,
      message,
      'ok',
      navigateTo
    );
  }

  onDelete(): void {
    const dialogData: ConfirmationDialog = {
      title: 'Remover',
      description: `Você deseja excluir "${this.form.get('name')?.value}"?`,
    }

    this._dialogSubscription$.next();
    const dialog = this._dialog.open(ConfirmationDialogComponent, { data: dialogData, width: '80%' });
    dialog.afterClosed().pipe(
      takeUntil(this._dialogSubscription$),
      switchMap(value => {
        if (value) {
          const id: number = this.form.get('id')?.value;
          return this._sprintService.deleteSprint(id);
        }
        return of();
      })
    ).subscribe({
      next: () => {
        this._onRequestSuccess('Sprint removida', ['settings', 'sprint']);
      },
      error: (error: HttpErrorResponse) => {
        this._onRequestError(error);
      }
    });
  }

  onSubmit(): void {
    if (this.form.valid) {
      let obj: any = this.form.getRawValue();
      let update: boolean;

      obj.squads = obj.squads.map((squad: Squad) => squad.id);

      delete obj.squad;
      update = !!(obj?.id);

      of(undefined).pipe(
        takeUntil(this._sprintChangeSubscription$),
        switchMap(() => {
          if (update) return this._sprintService.patchSprint(obj.id, obj);
          return this._sprintService.postSprint(obj);
        })
      ).subscribe({
        next: () => {
          this._sprintService.requestSprints({});
          let message: string;

          message = (update) ? 'Sprint atualizada' : 'Sprint adicionada';
          this._onRequestSuccess(message);

          if (update) {
            return;
          };

          this.form.reset();
        },
        error: (error: HttpErrorResponse) => {
          this._onRequestError(error)
        }
      })
    }
  }

  onSelectSquad(event: MatAutocompleteSelectedEvent): void {
    const control: AbstractControl | null = this.form.get('squads');
    const formValue: any[] = control?.value;
    let index: number = formValue.findIndex((squad: Squad) => squad.id === event.option.value.id);

    if (index === -1) control?.patchValue([...formValue, ...[event.option.value]]);
    this.form.get('squad')?.patchValue(null);
  }

  onRemoveSquad(squad: Squad): void {
    const control: AbstractControl | null = this.form.get('squads');
    let formValue: any[] = control?.value;

    formValue = formValue.filter((_squad: Squad) => squad.id !== _squad.id);
    control?.patchValue(formValue);
    this.form.get('squad')?.patchValue(null);
  }

  ngOnInit(): void {
    this._activatedRoute.params.pipe(
      takeUntil(this._isDestroyed$),
      switchMap((params: any) => {
        if (params.id) return this._sprintService.getSprint(params.id);
        return of();
      })
    ).subscribe({
      next: (value: any) => {
        if (value) {
          this.icon = 'edit';
          this.update = true;
          this.form.patchValue(value);
          this.subtitle = 'Editar, visualizar ou remover';
          return;
        }

        this.update = false;
        this.subtitle = 'Criar a sprint';
        return;
      },
      error: (error: HttpErrorResponse) => {
        this._onRequestError(error);
      }
    });

    if (this._squadService.squadsIsEmpty()) this._squadService.requestSquad();
    if (this._sprintSettingsService.sprintSettingsIsEmpty()) this._sprintSettingsService.requestSprintSettings();

    this.squads$ = this._squadService.getSquads();
    this.sprintSettings$ = this._sprintSettingsService.getSprintSettings();

    this.filteredSquads$ = this.form.get('squad')?.valueChanges.pipe(
      startWith(null),
      switchMap((squad: any | null) => {
        const _squad: string = (squad && typeof squad === 'object') ? squad.name : squad;

        if (_squad) return this._filterSquads(_squad);
        return this.squads$;
      })) || of([]);
  }

  ngOnDestroy(): void {
    this._isDestroyed$.next();
    this._isDestroyed$.complete();
    this._dialogSubscription$.next();
    this._dialogSubscription$.complete();
    this._snackbarSubscription$.next();
    this._snackbarSubscription$.complete();
    this._sprintChangeSubscription$.next();
    this._sprintChangeSubscription$.complete();
  }

}
